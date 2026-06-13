import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { Physics } from '../core/Physics';
import { Input } from '../core/Input';
import { TouchControls } from '../core/TouchControls';
import { AssetManager } from '../core/AssetManager';
import { World } from '../core/World';
import { TrackBuilder } from '../track/TrackBuilder';
import { Scenery } from '../track/Scenery';
import { TRACKS, TrackDefinition, THEMES, trackById } from '../track/tracks';
import { TrackManager, Progress } from '../track/TrackManager';
import { Kart, KartEvent } from '../vehicle/Kart';
import { PlayerController } from '../vehicle/PlayerController';
import { AIController } from '../vehicle/AIController';
import { UpgradeKey, vehicleById } from '../vehicle/vehicles';
import { RaceManager, RacerEntry } from '../race/RaceManager';
import { GhostSystem } from '../race/GhostSystem';
import { NetClient, NetKartState, NetStartConfig } from '../net/NetClient';
import { ChaseCamera } from '../camera/ChaseCamera';
import { SmokeSystem } from '../effects/SmokeSystem';
import { AudioManager } from '../audio/AudioManager';
import { PlayerProfile } from '../save/PlayerProfile';
import { ItemManager } from '../items/ItemManager';
import { ItemEffectContext } from '../items/ItemEffect';
import { ReplayRecorder, ReplayData } from '../replay/ReplaySystem';
import { HUD } from '../ui/HUD';
import { Minimap } from '../ui/Minimap';
import { Screens, RaceRewards } from '../ui/Screens';
import { KART, PHYSICS, RACE, RACERS } from './config';
import { AssetManifestEntry } from '../core/AssetManager';

const FIXED_DT = 1 / PHYSICS.TICK_RATE;

/** Semantic sound cue → Kenney sample basename in the asset manifest. */
const SOUND_FILES: Record<string, string> = {
  count: 'tick_001',
  go: 'confirmation_001',
  lap: 'pluck_001',
  tier1: 'tick_002',
  tier2: 'glass_002',
  mini: 'maximize_004',
  nitro: 'maximize_008',
  'impact-a': 'impactMetal_medium_000',
  'impact-b': 'impactMetal_medium_001',
  'impact-c': 'impactMetal_medium_002',
  'impact-heavy': 'impactMetal_heavy_001',
  finish: 'jingles_NES03',
};

/**
 * Composition root: owns renderer/scene/physics and wires the ECS-like world
 * (kart entities + systems) to race logic, UI and effects.
 */
export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private physics = new Physics();
  private touch = new TouchControls();
  private input = new Input(this.touch);
  private world = new World();

  private trackManager!: TrackManager;
  private raceManager!: RaceManager;
  private chaseCam: ChaseCamera;
  private smoke: SmokeSystem;
  private audio: AudioManager;
  private hud = new HUD();
  private minimap!: Minimap;
  private screens = new Screens();
  private profile = new PlayerProfile();
  private items = new ItemManager();
  private replayRecorder = new ReplayRecorder();
  /** Most recent finished race (replay viewer foundation). */
  lastReplay?: ReplayData;
  /** Coins picked up during the current race (banked at the finish line). */
  private raceCoins = 0;

  // theme lighting (recolored per track)
  private hemi!: THREE.HemisphereLight;
  private sun!: THREE.DirectionalLight;

  private playerKart!: Kart;
  private playerController!: PlayerController;
  private entries: RacerEntry[] = [];
  private models: Map<string, THREE.Object3D>;

  // current track (rebuilt by setTrack)
  private currentTrackId = '';
  private trackGroup?: THREE.Group;
  private scenery?: Scenery;
  private trackColliders: RAPIER.Collider[] = [];

  private ghost = new GhostSystem();
  private mode: 'race' | 'timetrial' = 'race';

  // ---- online (M4 prototype) ----
  private net?: NetClient;
  private onlineRace = false;
  private netTick = 0;
  private onlineHitCooldown = 0;
  /** peer id → kart driven by network state (interpolation buffer). */
  private remotes = new Map<number, {
    kart: Kart;
    samples: { t: number; p: [number, number, number]; q: [number, number, number, number]; s: number; drift: boolean; boost: boolean }[];
    last?: NetKartState;
  }>();
  private remoteKarts = new Set<Kart>();

  private countdownLeft = 0;
  private lastCountShown = -1;
  private resultsRefresh = 0;
  private impactCooldown = 0;
  private accumulator = 0;
  private lastTime = performance.now();

  constructor(
    canvas: HTMLCanvasElement,
    private assets: AssetManager,
    kartModels: Map<string, THREE.Object3D> = new Map(),
    manifest: AssetManifestEntry[] = [],
  ) {
    const soundSources = new Map<string, string>();
    for (const [cue, file] of Object.entries(SOUND_FILES)) {
      const entry = manifest.find(
        (e) => e.type === 'audio' && e.key.toLowerCase().endsWith(`.${file.toLowerCase()}`),
      );
      if (entry) soundSources.set(cue, entry.url);
    }
    this.audio = new AudioManager(soundSources);
    this.audio.setBgmVolume(this.profile.settings.bgmVolume);
    this.audio.setSfxVolume(this.profile.settings.sfxVolume);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // sky, fog, lights (recolored per track theme in setTrack)
    this.scene.background = new THREE.Color(0x7ec8f0);
    this.scene.fog = new THREE.Fog(0x9adcf5, 140, 480);
    this.hemi = new THREE.HemisphereLight(0xcfeeff, 0x3e6b3a, 0.95);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff4d6, 1.5);
    this.sun.position.set(80, 120, 40);
    this.scene.add(this.sun);

    this.models = kartModels;

    // karts: entry 0 is the player, the rest AI (controllers wired per track)
    for (let i = 0; i < RACE.KART_COUNT; i++) {
      const spec = RACERS[i % RACERS.length];
      const template = spec.model ? kartModels.get(spec.model) : undefined;
      const kart = new Kart(this.physics, spec, i === 0, template);
      this.scene.add(kart.visual);
      this.entries.push({ kart, progress: new Progress() });
      this.world.createEntity(spec.name).add(kart);
    }
    this.playerKart = this.entries[0].kart;
    this.playerController = new PlayerController(this.input, this.playerKart);

    this.chaseCam = new ChaseCamera(window.innerWidth / window.innerHeight);
    this.smoke = new SmokeSystem(this.scene);

    this.applyPlayerVehicle();
    this.setTrack(TRACKS[0]);

    this.wireUi();
    this.setupNet();
    this.screens.setupFullscreenHelpers(this.touch.enabled);
    window.addEventListener('resize', () => this.onResize());
    this.screens.setLoading('ready', true);

    // debug/automation handle (used by scripts/smoke-test & soak tests)
    (window as unknown as Record<string, unknown>).__NITRO_RUSH__ = this;

    requestAnimationFrame((t) => this.loop(t));
  }

  // ---------------- race lifecycle ----------------

  /** (Re)build the circuit: visuals, colliders, scenery, managers, AI, minimap. */
  private setTrack(def: TrackDefinition): void {
    if (this.currentTrackId === def.id) return;
    this.currentTrackId = def.id;

    // tear down the previous track
    this.trackGroup?.removeFromParent();
    this.scenery?.dispose();
    for (const c of this.trackColliders) this.physics.world.removeCollider(c, false);
    this.trackColliders = [];

    // theme environment: sky, fog, lighting
    const theme = THEMES[def.theme];
    (this.scene.background as THREE.Color).setHex(theme.skyColor);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.setHex(theme.fogColor);
    fog.near = theme.fogNear;
    fog.far = theme.fogFar;
    this.hemi.color.setHex(theme.hemiSky);
    this.hemi.groundColor.setHex(theme.hemiGround);
    this.sun.color.setHex(theme.sunColor);
    this.sun.intensity = theme.sunIntensity;

    const builder = new TrackBuilder();
    const { data, group } = builder.build(def);
    this.trackGroup = group;
    this.scene.add(group);
    this.trackColliders = builder.buildPhysics(data, Physics.api, this.physics.world);
    this.scenery = new Scenery(this.scene, data, this.models, group, def.seed, theme.kitTrees);
    this.items.build(this.scene, data, def.seed);

    this.trackManager = new TrackManager(data, 3);
    this.raceManager = new RaceManager(this.trackManager);
    this.wireRaceEvents();

    // AI follow the new centerline
    this.entries.forEach((e, i) => {
      if (i > 0) {
        e.ai = new AIController(e.kart, data, () => this.entries.map((x) => x.kart));
      }
    });

    this.minimap = new Minimap(
      document.getElementById('minimap-canvas') as HTMLCanvasElement,
      data,
    );

    // idle pose on the new grid for the menu background
    this.raceManager.setup(this.entries);
    this.raceManager.state = 'idle';
    this.chaseCam.snapTo(this.playerKart);
  }

  private startRace(): void {
    this.onlineRace = false;
    this.remotes.clear();
    this.remoteKarts.clear();
    this.setTrack(trackById(this.screens.selectedTrack));
    this.trackManager.totalLaps = this.screens.selectedLaps;
    this.mode = this.screens.selectedMode;
    this.playerKart.perf = this.profile.currentStats();

    // fresh progress state for every racer
    for (const e of this.entries) {
      e.progress = new Progress();
      e.kart.state.nitroGauge = 0;
      e.kart.state.boostTimer = 0;
      e.kart.state.totalDriftScore = 0;
    }

    if (this.mode === 'timetrial') {
      // solo run: AI park far off-track, invisible; race state tracks player only
      this.entries.forEach((e, i) => {
        if (i === 0) return;
        e.kart.placeAt(new THREE.Vector3(400, 0.4, 380 + i * 8), 0);
        e.kart.visual.visible = false;
      });
      this.raceManager.setup([this.entries[0]]);
      this.ghost.start(
        this.scene, this.playerKart, this.currentTrackId, this.screens.selectedLaps,
      );
    } else {
      for (const e of this.entries) e.kart.visual.visible = true;
      this.ghost.dispose(this.scene);
      this.raceManager.setup(this.entries);
    }
    this.beginCountdown();
  }

  private beginCountdown(): void {
    this.screens.hideResults();
    this.screens.show('none');
    this.hud.show();
    this.raceCoins = 0;
    this.hud.setCoins(0);
    this.items.resetAll();
    this.replayRecorder.start(
      this.currentTrackId,
      this.trackManager.totalLaps,
      this.mode,
      this.raceManager.entries.map((e) => e.kart),
      this.raceManager.entries.map((e) => ({
        name: e.kart.spec.name,
        color: e.kart.spec.color,
        vehicleId: e.kart === this.playerKart ? this.profile.selectedVehicleId : undefined,
      })),
    );
    this.chaseCam.snapTo(this.playerKart);
    this.audio.start();
    this.audio.resume();
    this.audio.setEngineEnabled(true);
    this.countdownLeft = RACE.COUNTDOWN_SECONDS + 0.5; // brief hold on "3"
    this.lastCountShown = -1;
  }

  // ---------------- online session ----------------

  /** Connect to a room server with the given credentials. Called from UI or URL params. */
  private connectToRoom(name: string, room: string, server: string): void {
    this.screens.setOnlineJoining();

    const lobbyUpdate = () => {
      if (!this.net) return;
      const n = this.net;
      this.screens.renderLobby(n.members, n.isHost);
      // also keep setup-screen status in sync in case host is already there
      this.screens.setOnlineStatus(
        `ONLINE · ROOM ${n.room} · ${n.members.length} PLAYER${n.members.length > 1 ? 'S' : ''}` +
        (n.isHost ? ' · YOU ARE HOST' : ''),
      );
      if (this.raceManager.state === 'idle' || this.raceManager.state === 'postrace') {
        this.screens.setStartButton(
          n.isHost ? 'START RACE' : 'WAITING FOR HOST…',
          n.isHost,
        );
      }
    };

    this.net = new NetClient(server, room, name, {
      onJoined: lobbyUpdate,
      onMembers: lobbyUpdate,
      onStart: (config) => this.startOnlineRace(config),
      onState: (fromId, st) => {
        const r = this.remotes.get(fromId);
        if (!r) return;
        r.last = st;
        r.samples.push({
          t: performance.now() / 1000,
          p: st.p, q: st.q, s: st.s, drift: st.drift, boost: st.boost,
        });
        if (r.samples.length > 30) r.samples.shift();
      },
      onError: (reason) => {
        this.screens.setLobbyError(reason);
        this.screens.setOnlineStatus(`ONLINE ERROR: ${reason}`, true);
        this.screens.setStartButton('START RACE', true);
        this.net = undefined;
      },
    });
    this.net.connect();
  }

  /** Auto-connect when the URL carries ?room=CODE (&server=ws://..&name=..). */
  private setupNet(): void {
    const params = new URLSearchParams(location.search);
    const room = params.get('room');
    if (!room) return;
    const server = params.get('server') ?? 'ws://localhost:8787';
    const name = params.get('name') ?? `P${Math.floor(Math.random() * 90 + 10)}`;
    this.screens.initOnlineScreen();
    this.screens.show('online');
    this.connectToRoom(name, room, server);
  }

  /** Everyone in the room starts the same race (host-picked track/laps). */
  private startOnlineRace(config: NetStartConfig): void {
    if (!this.net) return;
    this.onlineRace = true;
    this.mode = 'race';
    this.setTrack(trackById(config.track));
    this.trackManager.totalLaps = config.laps;
    this.playerKart.perf = this.profile.currentStats();

    for (const e of this.entries) {
      e.progress = new Progress();
      e.kart.state.nitroGauge = 0;
      e.kart.state.boostTimer = 0;
      e.kart.state.totalDriftScore = 0;
    }
    this.ghost.dispose(this.scene);

    // local player races; peers take the next karts; the rest park off-track
    const peers = this.net.members.filter((m) => m.id !== this.net!.selfId);
    this.remotes.clear();
    this.remoteKarts.clear();
    this.entries.forEach((e, i) => {
      if (i === 0) return;
      const peer = peers[i - 1];
      if (peer) {
        e.kart.visual.visible = true;
        // body parked far away: remote karts are visual-only (no collisions)
        e.kart.placeAt(new THREE.Vector3(400, 0.4, 340 + i * 8), 0);
        this.remotes.set(peer.id, { kart: e.kart, samples: [] });
        this.remoteKarts.add(e.kart);
        const slot = this.trackManager.startTransform(this.net!.slotOf(peer.id));
        e.kart.visual.position.copy(slot.position).setY(0.05);
        e.kart.visual.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), slot.rotationY);
      } else {
        e.kart.placeAt(new THREE.Vector3(400, 0.4, 340 + i * 8), 0);
        e.kart.visual.visible = false;
      }
    });

    this.raceManager.setup([this.entries[0]]);
    const mySlot = this.trackManager.startTransform(this.net.slotOf(this.net.selfId));
    this.playerKart.placeAt(mySlot.position, mySlot.rotationY);
    this.entries[0].progress.sampleIndex =
      this.trackManager.data.closestSampleIndex(mySlot.position);

    this.beginCountdown();
  }

  /** Live rank against remote racers (scores arrive with their state). */
  private onlineRank(): number {
    const my = this.raceManager.player.progress;
    let rank = 1;
    for (const r of this.remotes.values()) {
      const st = r.last;
      if (!st) continue;
      if (st.finished && (!my.finished || st.finishTime < my.finishTime)) rank++;
      else if (!st.finished && !my.finished && st.score > my.score) rank++;
    }
    return rank;
  }

  private wireRaceEvents(): void {
    this.raceManager.events = {
      onPlayerLap: (lap, total, lapTime) => {
        this.audio.play('lap', 0.8);
        const remaining = total - lap;
        if (remaining === 1) this.hud.flashMessage('FINAL LAP!');
        else if (remaining > 1) this.hud.flashMessage(`LAP ${lap + 1}/${total}`);
      },
      onPlayerFinish: () => {
        this.audio.play('finish', 0.9);
        if (this.mode === 'timetrial') {
          const newRecord = this.ghost.finish(this.raceManager.player.progress.finishTime);
          this.hud.flashMessage(newRecord ? 'NEW RECORD!' : 'FINISH!', 3);
        } else {
          this.hud.flashMessage('FINISH!');
        }
        const rewards = this.bankRaceRewards();
        this.lastReplay = this.replayRecorder.finish(
          this.raceManager.rankings.map((e) => ({
            name: e.kart.spec.name,
            finishTime: e.progress.finishTime,
            bestLap: e.progress.bestLap,
          })),
        );
        this.screens.showResults(this.raceManager.rankings, this.raceManager.player, rewards);
      },
    };
  }

  /** Compute & persist career rewards for the just-finished race. */
  private bankRaceRewards(): RaceRewards {
    const player = this.raceManager.player;
    const rank = this.onlineRace ? this.onlineRank() : this.raceManager.rankOf(player);
    const placeTable = [100, 60, 40, 25, 20, 15, 10, 10];
    const placeCoins = this.mode === 'race' ? (placeTable[rank - 1] ?? 10) : 20;
    const driftCoins = Math.round(this.playerKart.state.totalDriftScore / 40);

    const records = this.profile.recordRaceResult({
      trackId: this.currentTrackId,
      laps: this.trackManager.totalLaps,
      finishTime: player.progress.finishTime,
      bestLap: player.progress.bestLap,
      // time trials don't count as wins (single-entry "rank 1" is meaningless)
      rank: this.mode === 'race' ? rank : 0,
      driftScore: this.playerKart.state.totalDriftScore,
    });

    const total = placeCoins + driftCoins + this.raceCoins;
    this.profile.addCoins(total);
    return {
      placeCoins,
      driftCoins,
      collectedCoins: this.raceCoins,
      total,
      balance: this.profile.coins,
      newBestLap: records.newBestLap,
      newBestTime: records.newBestTime,
    };
  }

  /** Effect context for a pickup collected by `kart` (AI get no coins/sounds). */
  private itemContext(kart: Kart): ItemEffectContext {
    const isPlayer = kart === this.playerKart;
    return {
      kart,
      isPlayer,
      awardCoins: (amount) => {
        if (!isPlayer) return;
        this.raceCoins += amount;
        this.hud.setCoins(this.raceCoins);
      },
      playSound: (cue, volume, rate) => {
        if (isPlayer) this.audio.play(cue, volume, rate);
      },
    };
  }

  /**
   * Proximity-based collision for remote karts (their physics bodies are
   * parked off-track — only their visuals represent their true position).
   * Called each fixed tick before physics.step() so both clients feel a bump.
   */
  private applyOnlineCollisions(dt: number): void {
    // Check radius is intentionally larger than kart width to absorb lag latency
    // (at 150 ms lag + 15 m/s speed, position error ≈ 2.25 m).
    const RADIUS = 2.8;
    const PUSH = 1800; // impulse [N·s]; kart mass = 180 kg → ~10 m/s delta at full overlap

    this.onlineHitCooldown = Math.max(0, this.onlineHitCooldown - dt);
    const pt = this.playerKart.body.translation();

    for (const r of this.remotes.values()) {
      const vp = r.kart.visual.position;
      const dx = pt.x - vp.x;
      const dz = pt.z - vp.z;
      const dist2 = dx * dx + dz * dz;
      if (dist2 < 0.01 || dist2 >= RADIUS * RADIUS) continue;

      const dist = Math.sqrt(dist2);
      const nx = dx / dist;
      const nz = dz / dist;
      const overlap = (RADIUS - dist) / RADIUS; // 0..1

      // repulsion impulse — pushes player away from remote kart
      this.playerKart.body.applyImpulse(
        { x: nx * PUSH * overlap, y: 0, z: nz * PUSH * overlap },
        true,
      );

      // cancel the velocity component going toward the remote (prevents tunnelling)
      const vel = this.playerKart.body.linvel();
      const approaching = -(vel.x * nx + vel.z * nz); // positive = moving toward remote
      if (approaching > 0) {
        this.playerKart.body.setLinvel(
          { x: vel.x + nx * approaching * 0.55, y: vel.y, z: vel.z + nz * approaching * 0.55 },
          true,
        );
      }

      if (this.onlineHitCooldown <= 0 && overlap > 0.08) {
        this.onlineHitCooldown = 0.4;
        this.audio.play('bump', Math.min(1, 0.5 + overlap * 0.6));
      }
    }
  }

  /** Dress the player kart as the profile's vehicle and apply its physics. */
  private applyPlayerVehicle(): void {
    const def = vehicleById(this.profile.selectedVehicleId);
    const template = def.model ? this.models.get(def.model) : undefined;
    this.playerKart.applyVehicle(def.color, def.accent, template);
    this.playerKart.perf = this.profile.currentStats();
  }

  /** Back to the main menu with an idle grid as the backdrop. */
  private toMenu(): void {
    if (this.net) {
      this.net.disconnect();
      this.net = undefined;
    }
    for (const e of this.entries) {
      e.kart.visual.visible = true;
      e.progress = new Progress();
    }
    this.ghost.dispose(this.scene);
    this.raceManager.setup(this.entries);
    this.raceManager.state = 'idle';
    this.chaseCam.snapTo(this.playerKart);
    this.hud.hide();
    this.audio.setEngineEnabled(false);
    this.screens.updateProfileBar(this.profile);
    this.screens.show('menu');
  }

  private wireUi(): void {
    const s = this.screens;
    s.onUiClick = () => this.audio.play('click', 0.5);

    // splash doubles as the audio-unlock gesture; BGM starts in the menu
    s.onSplashStart = () => {
      this.audio.start();
      this.audio.setEngineEnabled(false);
      s.updateProfileBar(this.profile);
      s.show('menu');
    };
    s.onMenuRace = () => {
      s.renderTracks(this.profile);
      s.show('setup');
    };
    s.onMenuOnline = () => {
      s.initOnlineScreen();
      s.show('online');
    };
    s.onMenuGarage = () => {
      s.renderGarage(this.profile);
      s.show('garage');
    };
    s.onMenuSettings = () => {
      s.renderSettings(this.profile.settings);
      s.show('settings');
    };
    s.onBackToMenu = () => {
      s.updateProfileBar(this.profile);
      s.show('menu');
    };
    s.onSetupBack = () => {
      if (this.net?.connected) {
        s.renderLobby(this.net.members, this.net.isHost);
        s.show('online');
      } else {
        s.updateProfileBar(this.profile);
        s.show('menu');
      }
    };
    s.onResultsMenu = () => this.toMenu();
    s.onOnlineBack = () => {
      if (this.net) {
        this.net.disconnect();
        this.net = undefined;
      }
      s.updateProfileBar(this.profile);
      s.show('menu');
    };
    s.onOnlineJoin = (name, room, server) => {
      this.connectToRoom(name, room, server);
    };
    s.onLobbySetup = () => {
      if (!this.net) return;
      const n = this.net;
      s.setOnlineStatus(
        `ONLINE · ROOM ${n.room} · ${n.members.length} PLAYER${n.members.length > 1 ? 'S' : ''} · YOU ARE HOST`,
      );
      s.setStartButton('START RACE', true);
      s.renderTracks(this.profile);
      s.show('setup');
    };
    s.onLobbyCopy = (room, server) => {
      const base = location.href.split('?')[0];
      const params = new URLSearchParams({ room, server, name: 'PLAYER' });
      const link = `${base}?${params}`;
      navigator.clipboard?.writeText(link).catch(() => {});
    };

    s.onSettingsChange = (patch) => {
      this.profile.updateSettings(patch);
      if (patch.bgmVolume !== undefined) this.audio.setBgmVolume(patch.bgmVolume);
      if (patch.sfxVolume !== undefined) this.audio.setSfxVolume(patch.sfxVolume);
    };

    // garage: select / buy vehicles, buy upgrades
    s.onVehicleSelect = (id) => {
      this.profile.selectVehicle(id);
      this.applyPlayerVehicle();
      s.renderGarage(this.profile);
    };
    s.onVehicleBuy = (id) => {
      if (this.profile.buyVehicle(id)) {
        this.audio.play('purchase', 0.9);
        this.profile.selectVehicle(id);
        this.applyPlayerVehicle();
      } else {
        this.audio.play('denied', 0.8);
      }
      s.renderGarage(this.profile);
    };
    s.onUpgradeBuy = (vehicleId, key) => {
      if (this.profile.buyUpgrade(vehicleId, key as UpgradeKey)) {
        this.audio.play('purchase', 0.9);
        this.applyPlayerVehicle();
      } else {
        this.audio.play('denied', 0.8);
      }
      s.renderGarage(this.profile);
    };

    // setup: track unlocks + idle backdrop preview
    s.onTrackBuy = (id) => {
      const def = trackById(id);
      if (this.profile.buyTrack(id, def.unlockCost)) {
        this.audio.play('purchase', 0.9);
        s.selectedTrack = id;
        s.renderTracks(this.profile);
        if (this.raceManager.state === 'idle') this.setTrack(def);
      } else {
        this.audio.play('denied', 0.8);
      }
    };
    s.onTrackChange = (id) => {
      if (this.raceManager.state === 'idle') {
        this.setTrack(trackById(id));
      }
    };

    // online: only the host launches races (broadcast starts everyone)
    const requestStart = () => {
      if (this.net?.connected) {
        this.net.sendStart({
          track: this.screens.selectedTrack,
          laps: this.screens.selectedLaps,
        });
      } else {
        this.startRace();
      }
    };
    s.onStart(requestStart);
    s.onRestart(requestStart);
  }

  // ---------------- main loop ----------------

  private loop(now: number): void {
    requestAnimationFrame((t) => this.loop(t));
    const frameDt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;

    this.input.pollGamepad();
    if (this.input.muteToggle) this.audio.toggleMusic();
    this.updateCountdown(frameDt);

    // fixed-step simulation
    this.accumulator += frameDt;
    while (this.accumulator >= FIXED_DT) {
      this.fixedStep(FIXED_DT);
      this.accumulator -= FIXED_DT;
    }
    const alpha = this.accumulator / FIXED_DT;

    this.render(frameDt, alpha);
    this.input.endFrame();
  }

  private fixedStep(dt: number): void {
    const racing = this.raceManager.state === 'racing' ||
      this.raceManager.state === 'postrace';
    const playerDriving = this.raceManager.state === 'racing';

    // controllers write intents (AI sit out time trials and online races)
    this.playerController.fixedUpdate(playerDriving);
    const aiActive = racing && this.mode === 'race' && !this.onlineRace;
    for (const e of this.entries) e.ai?.fixedUpdate(dt, aiActive);

    // handling model + physics step
    if (racing) {
      for (const e of this.entries) e.kart.fixedUpdate(dt);
      if (this.onlineRace) this.applyOnlineCollisions(dt);

      // player velocity before/after the solver step ⇒ collision feedback
      const before = this.playerKart.body.linvel();
      const bx = before.x, bz = before.z;
      this.physics.step();
      const after = this.playerKart.body.linvel();
      const dv = Math.hypot(after.x - bx, after.z - bz);
      this.impactCooldown = Math.max(0, this.impactCooldown - dt);
      if (dv > 4 && dv < 20 && this.impactCooldown <= 0) {
        this.impactCooldown = 0.3;
        const heavy = dv > 9;
        const cue = heavy
          ? 'impact-heavy'
          : ['impact-a', 'impact-b', 'impact-c'][Math.floor(Math.random() * 3)];
        this.audio.play(cue, Math.min(1, 0.35 + (dv - 4) / 10));
      }

      this.raceManager.fixedUpdate(dt);
      this.drainKartEvents();
      this.replayRecorder.recordTick();

      // pickups: every active racer can collect (parked karts are far away)
      if (this.raceManager.state === 'racing') {
        this.items.fixedUpdate(
          dt,
          this.raceManager.entries.map((e) => e.kart),
          (kart) => this.itemContext(kart),
        );
      }

      if (this.mode === 'timetrial' && !this.raceManager.player.progress.finished) {
        this.ghost.recordTick(this.playerKart);
      }

      // broadcast our kart at ~12 Hz
      if (this.onlineRace && this.net?.connected && ++this.netTick % 5 === 0) {
        const t = this.playerKart.body.translation();
        const r = this.playerKart.body.rotation();
        const st = this.playerKart.state;
        const prog = this.raceManager.player.progress;
        this.net.sendState({
          p: [t.x, t.y, t.z],
          q: [r.x, r.y, r.z, r.w],
          s: st.forwardSpeed,
          drift: st.isDrifting,
          boost: st.isBoosting,
          score: prog.score,
          finished: prog.finished,
          finishTime: prog.finishTime,
        });
      }
    }

    this.world.fixedUpdate(dt); // hooks for future systems

    // manual respawn
    if (playerDriving && this.input.reset) {
      this.raceManager.respawn(this.raceManager.player);
      this.chaseCam.snapTo(this.playerKart);
    }
  }

  /** Player kart events drive SFX; AI events are discarded (but must be drained). */
  private drainKartEvents(): void {
    for (const e of this.entries) {
      const events = e.kart.state.events;
      if (events.length === 0) continue;
      if (e === this.raceManager.player) {
        for (const ev of events) this.onPlayerKartEvent(ev);
      }
      events.length = 0;
    }
  }

  private onPlayerKartEvent(ev: KartEvent): void {
    switch (ev) {
      case 'drift-tier-1': this.audio.play('tier1', 0.7, 1.1); break;
      case 'drift-tier-2': this.audio.play('tier2', 0.8); break;
      case 'drift-tier-3': this.audio.play('tier2', 0.9, 1.4); break;
      case 'mini-boost-1': this.audio.play('mini', 0.9, 1.2); break;
      case 'mini-boost-2': this.audio.play('mini', 1.0, 0.85); break;
      case 'mini-boost-3': this.audio.play('mini', 1.0, 0.65); break;
      case 'nitro': this.audio.play('nitro', 1.0); break;
    }
  }

  private updateCountdown(dt: number): void {
    if (this.raceManager.state !== 'countdown' || this.countdownLeft <= 0) return;
    this.countdownLeft -= dt;
    const count = Math.ceil(this.countdownLeft);
    if (this.countdownLeft <= 0) {
      this.screens.showCountdown('GO!', true);
      this.audio.play('go', 0.9);
      this.raceManager.go();
      setTimeout(() => this.screens.hideCountdown(), 700);
    } else if (count !== this.lastCountShown && count <= RACE.COUNTDOWN_SECONDS) {
      this.screens.showCountdown(count.toString());
      this.audio.play('count', 0.8);
      this.lastCountShown = count;
    }
  }

  private render(dt: number, alpha: number): void {
    for (const e of this.entries) {
      if (!this.remoteKarts.has(e.kart)) e.kart.syncVisual(alpha);
    }
    if (this.onlineRace) this.updateRemotes();
    this.world.update(dt, alpha);
    this.items.update(dt);

    this.chaseCam.update(this.playerKart, dt);
    // remote karts' bodies are parked; their smoke would emit at the car park
    this.smoke.update(
      this.entries.map((e) => e.kart).filter((k) => !this.remoteKarts.has(k)),
      dt,
    );
    this.audio.update(this.playerKart.state);
    if (this.mode === 'timetrial') this.ghost.update(this.raceManager.raceTime);

    const rm = this.raceManager;
    if (rm.state === 'racing' || rm.state === 'postrace') {
      const player = rm.player;
      this.hud.update(
        dt,
        player.kart.state,
        player.progress,
        this.onlineRace ? this.onlineRank() : rm.rankOf(player),
        this.trackManager.totalLaps,
        rm.raceTime,
      );
      const dots = rm.entries.map((e, i) => {
        const p = e.kart.position;
        return { x: p.x, z: p.z, color: e.kart.spec.color, isPlayer: i === 0 };
      });
      for (const r of this.remotes.values()) {
        dots.push({
          x: r.kart.visual.position.x,
          z: r.kart.visual.position.z,
          color: r.kart.spec.color,
          isPlayer: false,
        });
      }
      this.minimap.draw(dots);
    }

    // keep the results table fresh while AI finish their laps
    if (rm.state === 'postrace' && !rm.allFinished) {
      this.resultsRefresh -= dt;
      if (this.resultsRefresh <= 0) {
        this.resultsRefresh = 0.5;
        this.screens.showResults(rm.rankings, rm.player);
      }
    }

    this.renderer.render(this.scene, this.chaseCam.camera);
  }

  /** Drive remote kart visuals from their state buffers (render ~150 ms behind). */
  private updateRemotes(): void {
    const renderT = performance.now() / 1000 - 0.15;
    const pa = new THREE.Vector3();
    const pb = new THREE.Vector3();
    const qa = new THREE.Quaternion();
    const qb = new THREE.Quaternion();
    for (const r of this.remotes.values()) {
      const s = r.samples;
      if (s.length === 0) continue;
      let i = s.length - 1;
      while (i > 0 && s[i - 1].t > renderT) i--;
      const a = s[Math.max(0, i - 1)];
      const b = s[i];
      const span = b.t - a.t;
      const t = span > 0.0001 ? THREE.MathUtils.clamp((renderT - a.t) / span, 0, 1) : 1;
      pa.set(a.p[0], a.p[1], a.p[2]);
      pb.set(b.p[0], b.p[1], b.p[2]);
      qa.set(a.q[0], a.q[1], a.q[2], a.q[3]);
      qb.set(b.q[0], b.q[1], b.q[2], b.q[3]);
      r.kart.visual.position.lerpVectors(pa, pb, t);
      r.kart.visual.position.y -= KART.HALF_HEIGHT; // body center → visual origin
      r.kart.visual.quaternion.copy(qa).slerp(qb, t);
    }
  }

  private onResize(): void {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.chaseCam.resize(window.innerWidth / window.innerHeight);
  }
}
