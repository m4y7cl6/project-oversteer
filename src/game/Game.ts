import * as THREE from 'three';
import { Physics } from '../core/Physics';
import { Input } from '../core/Input';
import { AssetManager } from '../core/AssetManager';
import { World } from '../core/World';
import { TrackBuilder } from '../track/TrackBuilder';
import { TrackManager, Progress } from '../track/TrackManager';
import { Kart } from '../vehicle/Kart';
import { PlayerController } from '../vehicle/PlayerController';
import { AIController } from '../vehicle/AIController';
import { RaceManager, RacerEntry } from '../race/RaceManager';
import { ChaseCamera } from '../camera/ChaseCamera';
import { SmokeSystem } from '../effects/SmokeSystem';
import { EngineAudio } from '../effects/EngineAudio';
import { HUD } from '../ui/HUD';
import { Minimap } from '../ui/Minimap';
import { Screens } from '../ui/Screens';
import { PHYSICS, RACE, RACERS } from './config';

const FIXED_DT = 1 / PHYSICS.TICK_RATE;

/**
 * Composition root: owns renderer/scene/physics and wires the ECS-like world
 * (kart entities + systems) to race logic, UI and effects.
 */
export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private physics = new Physics();
  private input = new Input();
  private world = new World();

  private trackManager: TrackManager;
  private raceManager: RaceManager;
  private chaseCam: ChaseCamera;
  private smoke: SmokeSystem;
  private audio = new EngineAudio();
  private hud = new HUD();
  private minimap: Minimap;
  private screens = new Screens();

  private playerKart: Kart;
  private playerController: PlayerController;
  private entries: RacerEntry[] = [];

  private countdownLeft = 0;
  private lastCountShown = -1;
  private resultsRefresh = 0;
  private accumulator = 0;
  private lastTime = performance.now();

  constructor(
    canvas: HTMLCanvasElement,
    private assets: AssetManager,
    kartModels: Map<string, THREE.Object3D> = new Map(),
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // sky, fog, lights
    this.scene.background = new THREE.Color(0x7ec8f0);
    this.scene.fog = new THREE.Fog(0x9adcf5, 140, 480);
    this.scene.add(new THREE.HemisphereLight(0xcfeeff, 0x3e6b3a, 0.95));
    const sun = new THREE.DirectionalLight(0xfff4d6, 1.5);
    sun.position.set(80, 120, 40);
    this.scene.add(sun);

    // track (visuals + static physics)
    const builder = new TrackBuilder();
    const { data, group } = builder.build();
    this.scene.add(group);
    builder.buildPhysics(data, Physics.api, this.physics.world);
    this.trackManager = new TrackManager(data, 3);
    this.raceManager = new RaceManager(this.trackManager);

    // karts: entry 0 is the player, the rest AI
    for (let i = 0; i < RACE.KART_COUNT; i++) {
      const spec = RACERS[i % RACERS.length];
      const template = spec.model ? kartModels.get(spec.model) : undefined;
      const kart = new Kart(this.physics, spec, i === 0, template);
      this.scene.add(kart.visual);
      const entry: RacerEntry = { kart, progress: new Progress() };
      if (i > 0) {
        entry.ai = new AIController(kart, data, () => this.entries.map((e) => e.kart));
      }
      this.entries.push(entry);
      this.world.createEntity(spec.name).add(kart).add(entry.progress);
    }
    this.playerKart = this.entries[0].kart;
    this.playerController = new PlayerController(this.input, this.playerKart);

    this.chaseCam = new ChaseCamera(window.innerWidth / window.innerHeight);
    this.smoke = new SmokeSystem(this.scene);
    this.minimap = new Minimap(
      document.getElementById('minimap-canvas') as HTMLCanvasElement,
      data,
    );

    this.wireRaceEvents();
    this.wireUi();
    window.addEventListener('resize', () => this.onResize());

    // idle pose for the menu background
    this.raceManager.setup(this.entries);
    this.raceManager.state = 'idle';
    this.chaseCam.snapTo(this.playerKart);
    this.screens.setLoading('ready', true);

    // debug/automation handle (used by scripts/smoke-test & soak tests)
    (window as unknown as Record<string, unknown>).__NITRO_RUSH__ = this;

    requestAnimationFrame((t) => this.loop(t));
  }

  // ---------------- race lifecycle ----------------

  private startRace(): void {
    this.trackManager.totalLaps = this.screens.selectedLaps;

    // fresh progress state for every racer
    for (const e of this.entries) {
      e.progress = new Progress();
      e.kart.state.nitroGauge = 0;
      e.kart.state.boostTimer = 0;
      e.kart.state.totalDriftScore = 0;
    }

    this.raceManager.setup(this.entries);
    this.screens.hideStart();
    this.screens.hideResults();
    this.hud.show();
    this.chaseCam.snapTo(this.playerKart);
    this.audio.start();
    this.audio.resume();

    this.countdownLeft = RACE.COUNTDOWN_SECONDS + 0.5; // brief hold on "3"
    this.lastCountShown = -1;
  }

  private wireRaceEvents(): void {
    this.raceManager.events = {
      onPlayerLap: (lap, total, lapTime) => {
        const remaining = total - lap;
        if (remaining === 1) this.hud.flashMessage('FINAL LAP!');
        else if (remaining > 1) this.hud.flashMessage(`LAP ${lap + 1}/${total}`);
      },
      onPlayerFinish: () => {
        this.hud.flashMessage('FINISH!');
        this.screens.showResults(this.raceManager.rankings, this.raceManager.player);
      },
    };
  }

  private wireUi(): void {
    this.screens.onStart(() => this.startRace());
    this.screens.onRestart(() => this.startRace());
  }

  // ---------------- main loop ----------------

  private loop(now: number): void {
    requestAnimationFrame((t) => this.loop(t));
    const frameDt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;

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

    // controllers write intents
    this.playerController.fixedUpdate(playerDriving);
    for (const e of this.entries) e.ai?.fixedUpdate(dt, racing);

    // handling model + physics step
    if (racing) {
      for (const e of this.entries) e.kart.fixedUpdate(dt);
      this.physics.step();
      this.raceManager.fixedUpdate(dt);
    }

    this.world.fixedUpdate(dt); // hooks for future systems

    // manual respawn
    if (playerDriving && this.input.reset) {
      this.raceManager.respawn(this.raceManager.player);
      this.chaseCam.snapTo(this.playerKart);
    }
  }

  private updateCountdown(dt: number): void {
    if (this.raceManager.state !== 'countdown' || this.countdownLeft <= 0) return;
    this.countdownLeft -= dt;
    const count = Math.ceil(this.countdownLeft);
    if (this.countdownLeft <= 0) {
      this.screens.showCountdown('GO!', true);
      this.raceManager.go();
      setTimeout(() => this.screens.hideCountdown(), 700);
    } else if (count !== this.lastCountShown && count <= RACE.COUNTDOWN_SECONDS) {
      this.screens.showCountdown(count.toString());
      this.lastCountShown = count;
    }
  }

  private render(dt: number, alpha: number): void {
    for (const e of this.entries) e.kart.syncVisual(alpha);
    this.world.update(dt, alpha);

    this.chaseCam.update(this.playerKart, dt);
    this.smoke.update(this.entries.map((e) => e.kart), dt);
    this.audio.update(this.playerKart.state);

    const rm = this.raceManager;
    if (rm.state === 'racing' || rm.state === 'postrace') {
      const player = rm.player;
      this.hud.update(
        dt,
        player.kart.state,
        player.progress,
        rm.rankOf(player),
        this.trackManager.totalLaps,
        rm.raceTime,
      );
      this.minimap.draw(rm.entries, 0);
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

  private onResize(): void {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.chaseCam.resize(window.innerWidth / window.innerHeight);
  }
}
