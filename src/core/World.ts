/**
 * Minimal ECS-like layer.
 *
 * Entities are ids with a bag of components; systems iterate entities that
 * carry the components they care about. This stays deliberately small — the
 * goal is module boundaries that can later host networking (each component is
 * plain state that could be serialized), not a full archetype ECS.
 */

export type EntityId = number;

export class Entity {
  private components = new Map<Function, unknown>();

  constructor(public readonly id: EntityId, public name = '') {}

  add<T extends object>(component: T): this {
    this.components.set(component.constructor, component);
    return this;
  }

  get<T>(ctor: new (...args: never[]) => T): T {
    const c = this.components.get(ctor);
    if (!c) throw new Error(`Entity ${this.name || this.id} missing component ${ctor.name}`);
    return c as T;
  }

  tryGet<T>(ctor: new (...args: never[]) => T): T | undefined {
    return this.components.get(ctor) as T | undefined;
  }

  has(ctor: Function): boolean {
    return this.components.has(ctor);
  }
}

export interface System {
  /** Called at the fixed physics rate. */
  fixedUpdate?(world: World, dt: number): void;
  /** Called once per rendered frame. */
  update?(world: World, dt: number, alpha: number): void;
}

export class World {
  private entities = new Map<EntityId, Entity>();
  private systems: System[] = [];
  private nextId = 1;

  createEntity(name = ''): Entity {
    const e = new Entity(this.nextId++, name);
    this.entities.set(e.id, e);
    return e;
  }

  removeEntity(id: EntityId): void {
    this.entities.delete(id);
  }

  addSystem(system: System): void {
    this.systems.push(system);
  }

  /** All entities carrying every listed component type. */
  query(...ctors: Function[]): Entity[] {
    const out: Entity[] = [];
    for (const e of this.entities.values()) {
      if (ctors.every((c) => e.has(c))) out.push(e);
    }
    return out;
  }

  all(): Entity[] {
    return [...this.entities.values()];
  }

  fixedUpdate(dt: number): void {
    for (const s of this.systems) s.fixedUpdate?.(this, dt);
  }

  update(dt: number, alpha: number): void {
    for (const s of this.systems) s.update?.(this, dt, alpha);
  }

  clear(): void {
    this.entities.clear();
    this.systems.length = 0;
    this.nextId = 1;
  }
}
