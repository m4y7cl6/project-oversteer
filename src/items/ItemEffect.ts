import { Kart } from '../vehicle/Kart';
import { NITRO } from '../game/config';

/**
 * What an item is allowed to touch when collected. Game supplies the
 * implementation, so effects stay decoupled from Game/HUD/audio internals.
 */
export interface ItemEffectContext {
  kart: Kart;
  isPlayer: boolean;
  /** Award career coins (Game ignores this for AI collectors). */
  awardCoins(amount: number): void;
  /** Fire a named audio cue (player-side feedback). */
  playSound(cue: string, volume?: number, rate?: number): void;
}

/** One collectible's gameplay consequence. Implementations must be stateless. */
export interface ItemEffect {
  apply(ctx: ItemEffectContext): void;
}

/** Instantly charges part of the collector's nitro gauge. */
export class NitroChargeEffect implements ItemEffect {
  constructor(private amount: number) {}

  apply(ctx: ItemEffectContext): void {
    const st = ctx.kart.state;
    st.nitroGauge = Math.min(NITRO.GAUGE_MAX, st.nitroGauge + this.amount);
    if (ctx.isPlayer) ctx.playSound('pickup', 0.9);
  }
}

/** Career currency; only meaningful for the player. */
export class CoinEffect implements ItemEffect {
  constructor(private amount: number) {}

  apply(ctx: ItemEffectContext): void {
    if (!ctx.isPlayer) return;
    ctx.awardCoins(this.amount);
    ctx.playSound('coin', 0.8, 1 + Math.random() * 0.15);
  }
}
