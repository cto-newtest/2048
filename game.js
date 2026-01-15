(() => {
  const SIZE = 4;
  const TARGET = 2028;

  const byId = (id) => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing element #${id}`);
    return el;
  };

  class Game2028 {
    constructor() {
      this.boardEl = byId("board");
      this.scoreEl = byId("score");
      this.bestEl = byId("best");
      this.statusEl = byId("status");
      this.newGameBtn = byId("newGame");

      this.bestKey = "bestScore2028";

      this._touch = {
        active: false,
        startX: 0,
        startY: 0,
        startT: 0,
      };

      this._raf = null;

      this._buildGrid();
      this._bind();
      this.reset();
    }

    _buildGrid() {
      this.boardEl.innerHTML = "";
      this.cells = [];

      for (let i = 0; i < SIZE * SIZE; i += 1) {
        const cell = document.createElement("div");
        cell.className = "cell";

        const tile = document.createElement("div");
        tile.className = "tile";
        tile.textContent = "";
        cell.appendChild(tile);

        this.boardEl.appendChild(cell);
        this.cells.push({ cell, tile });
      }
    }

    _bind() {
      this.newGameBtn.addEventListener("click", () => this.reset());

      document.addEventListener("keydown", (e) => {
        const dir = this._dirFromKey(e);
        if (!dir) return;

        e.preventDefault();
        this.move(dir);
      });

      document.querySelectorAll(".dpad-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const dir = btn.getAttribute("data-dir");
          if (!dir) return;
          this.move(dir);
        });
      });

      this.boardEl.addEventListener(
        "touchstart",
        (e) => {
          if (!e.touches || e.touches.length !== 1) return;
          const t = e.touches[0];
          this._touch.active = true;
          this._touch.startX = t.clientX;
          this._touch.startY = t.clientY;
          this._touch.startT = Date.now();
        },
        { passive: true }
      );

      this.boardEl.addEventListener(
        "touchmove",
        (e) => {
          if (!this._touch.active) return;
          if (e.cancelable) e.preventDefault();
        },
        { passive: false }
      );

      this.boardEl.addEventListener(
        "touchend",
        (e) => {
          if (!this._touch.active) return;
          this._touch.active = false;

          const t = e.changedTouches && e.changedTouches[0];
          if (!t) return;

          const dx = t.clientX - this._touch.startX;
          const dy = t.clientY - this._touch.startY;
          const dt = Date.now() - this._touch.startT;

          const absX = Math.abs(dx);
          const absY = Math.abs(dy);

          // Slightly forgiving threshold for phones.
          const minDistance = 24;
          const maxDuration = 700;

          if (dt > maxDuration) return;
          if (absX < minDistance && absY < minDistance) return;

          const dir = absX > absY ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
          this.move(dir);
        },
        { passive: true }
      );

      // Prevent double-tap zoom over the game on mobile.
      this.boardEl.addEventListener(
        "dblclick",
        (e) => {
          if (e.cancelable) e.preventDefault();
        },
        { passive: false }
      );
    }

    _dirFromKey(e) {
      switch (e.key) {
        case "ArrowUp":
        case "w":
        case "W":
          return "up";
        case "ArrowDown":
        case "s":
        case "S":
          return "down";
        case "ArrowLeft":
        case "a":
        case "A":
          return "left";
        case "ArrowRight":
        case "d":
        case "D":
          return "right";
        default:
          return null;
      }
    }

    reset() {
      this.grid = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => 0));
      this.score = 0;
      this.won = false;
      this.over = false;

      this.best = this._loadBest();
      this._setStatus("");

      this._addRandomTile();
      this._addRandomTile();
      this._render();
    }

    move(dir) {
      if (this.over) return;

      const before = this._serializeGrid(this.grid);

      let moved = false;
      let gained = 0;

      const applyLine = (line) => {
        const { next, scoreGained } = this._collapseLine(line);
        gained += scoreGained;
        if (!this._arraysEqual(line, next)) moved = true;
        return next;
      };

      if (dir === "left") {
        for (let r = 0; r < SIZE; r += 1) this.grid[r] = applyLine(this.grid[r]);
      } else if (dir === "right") {
        for (let r = 0; r < SIZE; r += 1) {
          const reversed = [...this.grid[r]].reverse();
          const next = applyLine(reversed).reverse();
          this.grid[r] = next;
        }
      } else if (dir === "up") {
        for (let c = 0; c < SIZE; c += 1) {
          const col = [];
          for (let r = 0; r < SIZE; r += 1) col.push(this.grid[r][c]);
          const next = applyLine(col);
          for (let r = 0; r < SIZE; r += 1) this.grid[r][c] = next[r];
        }
      } else if (dir === "down") {
        for (let c = 0; c < SIZE; c += 1) {
          const col = [];
          for (let r = 0; r < SIZE; r += 1) col.push(this.grid[r][c]);
          const reversed = col.reverse();
          const next = applyLine(reversed).reverse();
          for (let r = 0; r < SIZE; r += 1) this.grid[r][c] = next[r];
        }
      } else {
        return;
      }

      const after = this._serializeGrid(this.grid);
      if (!moved || before === after) return;

      this.score += gained;
      this.best = Math.max(this.best, this.score);
      this._saveBest(this.best);

      this._addRandomTile();

      if (!this.won && this._hasValueAtLeast(TARGET)) {
        this.won = true;
        this._setStatus(`Победа! Есть плитка ${TARGET}. Можно продолжать.`);
      }

      if (!this._hasMoves()) {
        this.over = true;
        this._setStatus("Ходов больше нет. Игра окончена.");
      }

      this._render();
    }

    _collapseLine(line) {
      const filtered = line.filter((v) => v !== 0);
      const next = [];
      let scoreGained = 0;

      for (let i = 0; i < filtered.length; i += 1) {
        const v = filtered[i];
        const n = filtered[i + 1];
        if (n !== undefined && n === v) {
          const merged = v + n;
          next.push(merged);
          scoreGained += merged;
          i += 1;
        } else {
          next.push(v);
        }
      }

      while (next.length < SIZE) next.push(0);

      return { next, scoreGained };
    }

    _addRandomTile() {
      const empties = [];
      for (let r = 0; r < SIZE; r += 1) {
        for (let c = 0; c < SIZE; c += 1) {
          if (this.grid[r][c] === 0) empties.push([r, c]);
        }
      }
      if (empties.length === 0) return;

      const [r, c] = empties[Math.floor(Math.random() * empties.length)];
      this.grid[r][c] = Math.random() < 0.9 ? 2 : 4;
    }

    _hasMoves() {
      for (let r = 0; r < SIZE; r += 1) {
        for (let c = 0; c < SIZE; c += 1) {
          const v = this.grid[r][c];
          if (v === 0) return true;

          const right = c + 1 < SIZE ? this.grid[r][c + 1] : null;
          const down = r + 1 < SIZE ? this.grid[r + 1][c] : null;
          if (right === v || down === v) return true;
        }
      }
      return false;
    }

    _hasValueAtLeast(x) {
      for (let r = 0; r < SIZE; r += 1) {
        for (let c = 0; c < SIZE; c += 1) {
          if (this.grid[r][c] >= x) return true;
        }
      }
      return false;
    }

    _render() {
      if (this._raf) cancelAnimationFrame(this._raf);
      this._raf = requestAnimationFrame(() => {
        // Animate score updates
        if (this.scoreEl.textContent !== String(this.score)) {
          this.scoreEl.classList.add('updating');
          this.scoreEl.textContent = String(this.score);
          setTimeout(() => this.scoreEl.classList.remove('updating'), 250);
        }
        
        this.bestEl.textContent = String(this.best);

        for (let r = 0; r < SIZE; r += 1) {
          for (let c = 0; c < SIZE; c += 1) {
            const idx = r * SIZE + c;
            const v = this.grid[r][c];
            const { tile } = this.cells[idx];

            const prevValue = tile.textContent;
            const newValue = v === 0 ? "" : String(v);
            
            // Check if this tile is being updated
            const isNew = prevValue === "" && newValue !== "";
            const isMerge = prevValue !== "" && newValue !== "" && prevValue !== newValue;
            
            tile.textContent = newValue;
            tile.style.background = this._tileColor(v);
            
            let className = `tile ${v === 0 ? "" : `v${v}`}`.trim();
            
            if (isNew) {
              className += ' new';
            } else if (isMerge) {
              className += ' merged';
            }
            
            tile.className = className;
          }
        }
      });
    }

    _tileColor(value) {
      if (value === 0) return "var(--tile-0)";
      const key = `--tile-${value}`;
      const style = getComputedStyle(document.documentElement);
      const v = style.getPropertyValue(key);
      if (v && v.trim()) return `var(${key})`;
      return "#3c3a32";
    }

    _arraysEqual(a, b) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
      return true;
    }

    _serializeGrid(grid) {
      return grid.map((row) => row.join(",")).join(";");
    }

    _setStatus(msg) {
      this.statusEl.textContent = msg;
    }

    _loadBest() {
      try {
        const raw = localStorage.getItem(this.bestKey);
        const n = raw ? Number(raw) : 0;
        return Number.isFinite(n) ? n : 0;
      } catch {
        return 0;
      }
    }

    _saveBest(value) {
      try {
        localStorage.setItem(this.bestKey, String(value));
      } catch {
        // ignore
      }
    }
  }

  new Game2028();
})();
