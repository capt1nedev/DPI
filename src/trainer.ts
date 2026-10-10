import {
  aimDelta,
  hitsTarget,
  targetAt,
  HORIZONTAL_FOV,
  TRIAL_MS,
  type Candidate,
  type InputMode,
  type Target,
  type Trial,
} from "./core.ts";

interface TrainerCallbacks {
  onStatus: (message: string) => void;
  onTick: (remaining: number, hits: number, shots: number) => void;
  onRunning: (running: boolean) => void;
  onComplete: (trial: Trial) => void;
}
type LockCanvas = HTMLCanvasElement & {
  requestPointerLock: (options?: {
    unadjustedMovement?: boolean;
  }) => Promise<void> | void;
};
export class Trainer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private callbacks: TrainerCallbacks;
  private active = false;
  private requesting = false;
  private inputMode: InputMode = "adjusted";
  private candidate: Candidate | null = null;
  private baseline = 0;
  private startedAt = 0;
  private targetSince = 0;
  private yaw = 0;
  private pitch = 0;
  private hits = 0;
  private shots = 0;
  private reactionMs: number[] = [];
  private target: Target = targetAt(0);
  private feedbackUntil = 0;
  private feedbackHit = false;
  private animation = 0;
  private tickSecond = -1;
  private disposed = false;
  private resizeObserver: ResizeObserver;

  constructor(canvas: HTMLCanvasElement, callbacks: TrainerCallbacks) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Your browser does not support the aim canvas.");
    this.ctx = ctx;
    this.callbacks = callbacks;
    document.addEventListener("pointerlockchange", this.onLockChange);
    document.addEventListener("mousemove", this.onMove);
    document.addEventListener("visibilitychange", this.onVisibility);
    window.addEventListener("blur", this.onBlur);
    canvas.addEventListener("mousedown", this.onShot);
    canvas.addEventListener("contextmenu", this.onContext);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    this.draw(performance.now());
  }
  get isRunning(): boolean {
    return this.active || this.requesting;
  }
  async start(candidate: Candidate, baseline: number): Promise<void> {
    if (this.isRunning) return;
    if (!this.canvas.requestPointerLock) {
      this.callbacks.onStatus(
        "Aim trials need a desktop browser with mouse pointer lock. The calculator and Range log still work here.",
      );
      return;
    }
    this.requesting = true;
    this.candidate = candidate;
    this.baseline = baseline;
    this.callbacks.onRunning(true);
    this.callbacks.onStatus(
      "Allow mouse capture to start. Press Esc to cancel a trial.",
    );
    try {
      try {
        const request = (this.canvas as LockCanvas).requestPointerLock({
          unadjustedMovement: true,
        });
        await request;
        this.inputMode =
          request && typeof request.then === "function" ? "raw" : "adjusted";
      } catch (error) {
        if (
          !(error instanceof DOMException) ||
          error.name !== "NotSupportedError"
        )
          throw error;
        await this.canvas.requestPointerLock();
        this.inputMode = "adjusted";
      }
      if (this.disposed) return;
      if (document.pointerLockElement !== this.canvas) {
        // Older implementations return void; allow their lock-change event to arrive.
        await new Promise<void>((resolve, reject) => {
          const timer = window.setTimeout(() => {
            cleanup();
            reject(new Error("Mouse capture was not granted."));
          }, 1800);
          const changed = () => {
            if (document.pointerLockElement === this.canvas) {
              cleanup();
              resolve();
            }
          };
          const failed = () => {
            cleanup();
            reject(new Error("Mouse capture was not granted."));
          };
          const cleanup = () => {
            clearTimeout(timer);
            document.removeEventListener("pointerlockchange", changed);
            document.removeEventListener("pointerlockerror", failed);
          };
          document.addEventListener("pointerlockchange", changed);
          document.addEventListener("pointerlockerror", failed);
          changed();
        });
      }
      if (
        this.disposed ||
        document.hidden ||
        !document.hasFocus() ||
        document.pointerLockElement !== this.canvas
      )
        throw new Error("Mouse capture ended before the trial started.");
      this.requesting = false;
      this.active = true;
      this.startedAt = performance.now();
      this.targetSince = this.startedAt;
      this.yaw = this.pitch = this.hits = this.shots = 0;
      this.reactionMs = [];
      this.target = targetAt(0);
      this.tickSecond = -1;
      this.canvas.focus();
      this.callbacks.onStatus(
        this.inputMode === "raw"
          ? "Raw mouse input · aim with the crosshair and left-click · Esc cancels"
          : "Adjusted mouse input · browser/OS acceleration may affect feel · verify in Valorant",
      );
      cancelAnimationFrame(this.animation);
      this.frame();
    } catch {
      this.requesting = false;
      this.active = false;
      if (document.pointerLockElement === this.canvas)
        document.exitPointerLock();
      this.callbacks.onRunning(false);
      this.callbacks.onStatus(
        "Mouse capture was unavailable. Use Chrome or Edge on desktop, allow capture, and click Run next trial again.",
      );
    }
  }
  private onLockChange = (): void => {
    if (this.active && document.pointerLockElement !== this.canvas)
      this.cancel("Trial cancelled. Incomplete trials are not scored.");
  };
  private onVisibility = (): void => {
    if (document.hidden)
      this.cancel(
        "Trial cancelled when the page was hidden. Run a fresh trial.",
      );
  };
  private onBlur = (): void => {
    if (this.active)
      this.cancel(
        "Trial cancelled when the window lost focus. Run a fresh trial.",
      );
  };
  private onContext = (event: Event): void => event.preventDefault();
  private onMove = (event: MouseEvent): void => {
    if (
      !this.active ||
      !this.candidate ||
      document.pointerLockElement !== this.canvas
    )
      return;
    // Browser raw movement approximates counts. Hardware DPI must match the app's DPI setting.
    this.yaw = Math.max(
      -75,
      Math.min(
        75,
        this.yaw + aimDelta(event.movementX, this.candidate.sensitivity),
      ),
    );
    this.pitch = Math.max(
      -45,
      Math.min(
        45,
        this.pitch - aimDelta(event.movementY, this.candidate.sensitivity),
      ),
    );
  };
  private onShot = (event: MouseEvent): void => {
    if (!this.active || event.button !== 0) return;
    event.preventDefault();
    const now = performance.now();
    if (now - this.startedAt >= TRIAL_MS) {
      this.finish();
      return;
    }
    this.shots++;
    this.feedbackHit = hitsTarget(this.yaw, this.pitch, this.target);
    this.feedbackUntil = now + 130;
    if (this.feedbackHit) {
      this.hits++;
      this.reactionMs.push(now - this.targetSince);
      this.targetSince = now;
      this.target = targetAt(this.hits);
    }
    this.callbacks.onTick(
      Math.max(0, Math.ceil((TRIAL_MS - (now - this.startedAt)) / 1000)),
      this.hits,
      this.shots,
    );
  };
  private frame = (): void => {
    if (!this.active) return;
    const now = performance.now();
    const remaining = Math.max(
      0,
      Math.ceil((TRIAL_MS - (now - this.startedAt)) / 1000),
    );
    if (remaining !== this.tickSecond) {
      this.tickSecond = remaining;
      this.callbacks.onTick(remaining, this.hits, this.shots);
    }
    this.draw(now);
    if (now - this.startedAt >= TRIAL_MS) {
      this.finish();
      return;
    }
    this.animation = requestAnimationFrame(this.frame);
  };
  private finish(): void {
    if (!this.active || !this.candidate) return;
    this.active = false;
    cancelAnimationFrame(this.animation);
    const trial: Trial = {
      ...this.candidate,
      id: crypto.randomUUID(),
      baseline: this.baseline,
      hits: this.hits,
      shots: this.shots,
      reactionMs: [...this.reactionMs],
      elapsedMs: TRIAL_MS,
      inputMode: this.inputMode,
      completedAt: new Date().toISOString(),
    };
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.callbacks.onRunning(false);
    this.callbacks.onComplete(trial);
    this.yaw = this.pitch = 0;
    this.draw(performance.now());
  }
  cancel(message = "Trial cancelled. Incomplete trials are not scored."): void {
    if (!this.active) return;
    this.active = false;
    cancelAnimationFrame(this.animation);
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.yaw = this.pitch = 0;
    this.callbacks.onRunning(false);
    this.callbacks.onStatus(message);
    this.draw(performance.now());
  }
  private resize(): void {
    const { width, height } = this.canvas.getBoundingClientRect();
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(width * scale);
    this.canvas.height = Math.round(height * scale);
    this.ctx.setTransform(scale, 0, 0, scale, 0, 0);
    this.draw(performance.now());
  }
  private project(
    x: number,
    y: number,
    z: number,
  ): { x: number; y: number; scale: number } | null {
    const w = this.canvas.clientWidth,
      h = this.canvas.clientHeight;
    const yaw = (this.yaw * Math.PI) / 180,
      pitch = (this.pitch * Math.PI) / 180;
    const horizontal = Math.cos(yaw) * x - Math.sin(yaw) * z;
    const forward = Math.sin(yaw) * x + Math.cos(yaw) * z;
    const vertical = Math.cos(pitch) * y - Math.sin(pitch) * forward;
    const depth = Math.sin(pitch) * y + Math.cos(pitch) * forward;
    if (depth < 0.1) return null;
    const focal = w / (2 * Math.tan((HORIZONTAL_FOV * Math.PI) / 360));
    return {
      x: w / 2 + (horizontal * focal) / depth,
      y: h / 2 - (vertical * focal) / depth,
      scale: focal / depth,
    };
  }
  private line(a: number[], b: number[], color: string): void {
    const p = this.project(a[0], a[1], a[2]),
      q = this.project(b[0], b[1], b[2]);
    if (!p || !q) return;
    this.ctx.strokeStyle = color;
    this.ctx.beginPath();
    this.ctx.moveTo(p.x, p.y);
    this.ctx.lineTo(q.x, q.y);
    this.ctx.stroke();
  }
  private draw(now: number): void {
    const ctx = this.ctx,
      w = this.canvas.clientWidth,
      h = this.canvas.clientHeight;
    if (!w || !h) return;
    ctx.clearRect(0, 0, w, h);
    const background = ctx.createLinearGradient(0, 0, 0, h);
    background.addColorStop(0, "#172422");
    background.addColorStop(0.55, "#1a2c26");
    background.addColorStop(1, "#101d19");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, w, h);
    ctx.lineWidth = 1;
    for (let x = -20; x <= 20; x += 2)
      this.line([x, -3, 1], [x, -3, 24], "#2b3e33");
    for (let z = 2; z <= 24; z += 2)
      this.line([-20, -3, z], [20, -3, z], "#2b3e33");
    for (let x = -20; x <= 20; x += 4)
      this.line([x, -3, 24], [x, 10, 24], "#263c32");
    for (let y = -3; y <= 10; y += 3)
      this.line([-20, y, 24], [20, y, 24], "#263c32");
    this.line([-20, -3, 24], [20, -3, 24], "#57704b");
    this.line([-8, -3, 24], [-8, 5, 24], "#455a3d");
    this.line([8, -3, 24], [8, 5, 24], "#455a3d");
    if (this.active) this.drawTarget(this.target, true);
    else {
      this.drawTarget({ yaw: -21, pitch: 6, radius: 1.5 }, false);
      this.drawTarget({ yaw: 17, pitch: -2, radius: 1.5 }, true);
      this.drawTarget({ yaw: 3, pitch: 11, radius: 1.5 }, false);
    }
    ctx.strokeStyle =
      now < this.feedbackUntil
        ? this.feedbackHit
          ? "#d5ff70"
          : "#ff8e82"
        : "#eef1e8";
    ctx.lineWidth = 1.5;
    const cx = w / 2,
      cy = h / 2;
    ctx.beginPath();
    ctx.moveTo(cx - 10, cy);
    ctx.lineTo(cx - 4, cy);
    ctx.moveTo(cx + 4, cy);
    ctx.lineTo(cx + 10, cy);
    ctx.moveTo(cx, cy - 10);
    ctx.lineTo(cx, cy - 4);
    ctx.moveTo(cx, cy + 4);
    ctx.lineTo(cx, cy + 10);
    ctx.stroke();
    ctx.fillStyle = "#eef1e8";
    ctx.fillRect(cx - 1, cy - 1, 2, 2);
    ctx.font = "10px monospace";
    ctx.fillStyle = "#72917b";
    ctx.fillText("SENS LAB / CONTROL ROOM", 20, h - 18);
  }
  private drawTarget(target: Target, bright: boolean): void {
    const yaw = (target.yaw * Math.PI) / 180,
      pitch = (target.pitch * Math.PI) / 180;
    const distance = 18;
    const projected = this.project(
      Math.sin(yaw) * Math.cos(pitch) * distance,
      Math.sin(pitch) * distance,
      Math.cos(yaw) * Math.cos(pitch) * distance,
    );
    if (!projected) return;
    const ctx = this.ctx;
    const radius =
      Math.tan((target.radius * Math.PI) / 180) * distance * projected.scale;
    ctx.save();
    ctx.globalAlpha = bright ? 1 : 0.45;
    ctx.shadowBlur = bright ? 22 : 0;
    ctx.shadowColor = "#d5ff7060";
    ctx.fillStyle = bright ? "#d5ff70" : "#799451";
    ctx.beginPath();
    ctx.arc(projected.x, projected.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = bright ? "#edffc9" : "#789358";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(projected.x, projected.y, radius + 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#20351c";
    ctx.beginPath();
    ctx.arc(
      projected.x,
      projected.y,
      Math.max(2, radius * 0.2),
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.restore();
  }
  dispose(): void {
    this.disposed = true;
    this.cancel();
    cancelAnimationFrame(this.animation);
    this.resizeObserver.disconnect();
    document.removeEventListener("pointerlockchange", this.onLockChange);
    document.removeEventListener("mousemove", this.onMove);
    document.removeEventListener("visibilitychange", this.onVisibility);
    window.removeEventListener("blur", this.onBlur);
    this.canvas.removeEventListener("mousedown", this.onShot);
    this.canvas.removeEventListener("contextmenu", this.onContext);
  }
}
