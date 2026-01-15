(() => {
  const SIZE = 4;
  const TARGET = 2028;

  const MOVE_MS = 120;
  const KNOWN_TILE_VALUES = new Set([0, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2028]);

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

      this._resizeRaf = null;
      this._pendingRaf = null;
      this._metrics = { gap: 12, cell: 0 };

      this.animating = false;
      this.nextId = 1;
      this._moveToken = 0;

      this._buildGrid();
      this._bind();
      this._measure();
      this.reset();
    }

    _buildGrid() {
      this.boardEl.innerHTML = "";

      const gridLayer = document.createElement("div");
      gridLayer.className = "grid-layer";

      for (let i = 0; i < SIZE * SIZE; i += 1) {
        const cell = document.createElement("div");
        cell.className = "cell";
        gridLayer.appendChild(cell);
      }

      const tileContainer = document.createElement("div");
      tileContainer.className = "tile-container";

      this.boardEl.appendChild(gridLayer);
      this.boardEl.appendChild(tileContainer);

      this.gridLayerEl = gridLayer;
      this.tileContainerEl = tileContainer;
    }

    _bind() {
      this.newGameBtn.addEventListener("click", () => this.reset());

      window.addEventListener("resize", () => this._onResize(), { passive: true });

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

          const minDistance = 24;
          const maxDuration = 700;

          if (dt > maxDuration) return;
          if (absX < minDistance && absY < minDistance) return;

          const dir = absX > absY ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
          this.move(dir);
        },
        { passive: true }
      );

      this.boardEl.addEventListener(
        "dblclick",
        (e) => {
          if (e.cancelable) e.preventDefault();
        },
        { passive: false }
      );
    }

    _onResize() {
      if (this._resizeRaf) cancelAnimationFrame(this._resizeRaf);
      this._resizeRaf = requestAnimationFrame(() => {
        this._measure();
        this._repositionAllTiles();
      });
    }

    _measure() {
      const boardRect = this.boardEl.getBoundingClientRect();
      const style = getComputedStyle(this.boardEl);
      const gap = Number.parseFloat(style.paddingLeft) || 12;

      const size = boardRect.width;
      const inner = size - 2 * gap;
      const cell = (inner - (SIZE - 1) * gap) / SIZE;

      this._metrics = { gap, cell };
      this.boardEl.style.setProperty("--cell-size", `${cell}px`);
      this.boardEl.style.setProperty("--move-ms", `${MOVE_MS}ms`);
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
      this.grid = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => null));
      this.tiles = new Map();
      this.tileContainerEl.innerHTML = "";
      this.nextId = 1;

      this.score = 0;
      this.won = false;
      this.over = false;
      this.animating = false;
      this._moveToken += 1;

      this.best = this._loadBest();
      this._setStatus("");
      this._updateHUD();

      this._addRandomTile(true);
      this._addRandomTile(true);
    }

    move(dir) {
      if (this.over || this.animating) return;

      const result = this._computeMove(dir);
      if (!result.moved) return;

      this.animating = true;
      const token = this._moveToken + 1;
      this._moveToken = token;

      const oldPositions = new Map();
      this.tiles.forEach((t, id) => {
        oldPositions.set(id, { row: t.row, col: t.col });
      });

      this.grid = result.newGrid;

      result.positions.forEach((pos, id) => {
        const t = this.tiles.get(id);
        if (!t) return;
        t.row = pos.row;
        t.col = pos.col;
      });

      const movingEls = [];

      result.positions.forEach((pos, id) => {
        const prev = oldPositions.get(id);
        if (!prev) return;
        if (prev.row === pos.row && prev.col === pos.col) return;
        const t = this.tiles.get(id);
        if (!t) return;
        movingEls.push(t.el);
      });

      for (const m of result.merges) {
        const removed = this.tiles.get(m.removedId);
        if (!removed) continue;

        const prev = oldPositions.get(m.removedId);
        if (!prev || prev.row !== m.to.row || prev.col !== m.to.col) {
          movingEls.push(removed.el);
        }

        removed.row = m.to.row;
        removed.col = m.to.col;
      }

      this._applyTransforms();

      this._waitForTransforms(movingEls).then(() => {
        if (token !== this._moveToken) return;

        for (const m of result.merges) {
          const survivor = this.tiles.get(m.survivorId);
          const removed = this.tiles.get(m.removedId);

          if (removed) {
            removed.el.remove();
            this.tiles.delete(m.removedId);
          }

          if (survivor) {
            survivor.value = m.newValue;
            this._updateTileAppearance(survivor);
            this._playTileAnim(survivor.el, "merged");
          }
        }

        this.score += result.scoreGained;
        this.best = Math.max(this.best, this.score);
        this._saveBest(this.best);

        this._updateHUD();

        this._addRandomTile(true);

        if (!this.won && this._hasValueAtLeast(TARGET)) {
          this.won = true;
          this._setStatus(`Победа! Есть плитка ${TARGET}. Можно продолжать.`);
        }

        if (!this._hasMoves()) {
          this.over = true;
          this._setStatus("Ходов больше нет. Игра окончена.");
        }

        this.animating = false;
      });
    }

    _computeMove(dir) {
      const newGrid = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => null));
      const positions = new Map();
      const merges = [];

      let moved = false;
      let scoreGained = 0;

      const coordsForLine = (index) => {
        const coords = [];

        if (dir === "left" || dir === "right") {
          const r = index;
          for (let c = 0; c < SIZE; c += 1) coords.push([r, c]);
          if (dir === "right") coords.reverse();
        } else {
          const c = index;
          for (let r = 0; r < SIZE; r += 1) coords.push([r, c]);
          if (dir === "down") coords.reverse();
        }

        return coords;
      };

      for (let line = 0; line < SIZE; line += 1) {
        const coords = coordsForLine(line);
        const ids = coords.map(([r, c]) => this.grid[r][c]).filter((x) => x != null);

        const out = Array.from({ length: SIZE }, () => null);
        let outIndex = 0;

        for (let i = 0; i < ids.length; i += 1) {
          const aId = ids[i];
          const a = aId != null ? this.tiles.get(aId) : null;
          const bId = ids[i + 1];
          const b = bId != null ? this.tiles.get(bId) : null;

          if (a && b && a.value === b.value) {
            out[outIndex] = aId;
            const [tr, tc] = coords[outIndex];
            merges.push({ survivorId: aId, removedId: bId, to: { row: tr, col: tc }, newValue: a.value + b.value });
            scoreGained += a.value + b.value;
            i += 1;
          } else {
            out[outIndex] = aId;
          }

          outIndex += 1;
        }

        for (let idx = 0; idx < SIZE; idx += 1) {
          const id = out[idx];
          if (id == null) continue;
          const [r, c] = coords[idx];
          newGrid[r][c] = id;
          positions.set(id, { row: r, col: c });
        }
      }

      positions.forEach((pos, id) => {
        const t = this.tiles.get(id);
        if (!t) return;
        if (t.row !== pos.row || t.col !== pos.col) moved = true;
      });

      if (merges.length > 0) moved = true;

      return { moved, newGrid, positions, merges, scoreGained };
    }

    _applyTransforms() {
      if (this._pendingRaf) cancelAnimationFrame(this._pendingRaf);
      this._pendingRaf = requestAnimationFrame(() => {
        this.tiles.forEach((t) => {
          const { x, y } = this._cellToPixels(t.row, t.col);
          t.el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        });
      });
    }

    _repositionAllTiles() {
      const tiles = Array.from(this.tiles.values());
      if (tiles.length === 0) return;

      for (const t of tiles) t.el.style.transition = "none";

      requestAnimationFrame(() => {
        for (const t of tiles) {
          const { x, y } = this._cellToPixels(t.row, t.col);
          t.el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        }

        requestAnimationFrame(() => {
          for (const t of tiles) t.el.style.transition = "";
        });
      });
    }

    _waitForTransforms(els) {
      return new Promise((resolve) => {
        const unique = Array.from(new Set(els));
        if (unique.length === 0) {
          resolve();
          return;
        }

        let done = 0;
        let finished = false;

        const finish = () => {
          if (finished) return;
          finished = true;
          resolve();
        };

        const timeout = setTimeout(finish, MOVE_MS + 80);

        unique.forEach((el) => {
          const onEnd = (e) => {
            if (e.propertyName !== "transform") return;
            el.removeEventListener("transitionend", onEnd);
            done += 1;
            if (done === unique.length) {
              clearTimeout(timeout);
              finish();
            }
          };
          el.addEventListener("transitionend", onEnd);
        });
      });
    }

    _addRandomTile(isNew = false) {
      const empties = [];
      for (let r = 0; r < SIZE; r += 1) {
        for (let c = 0; c < SIZE; c += 1) {
          if (this.grid[r][c] == null) empties.push([r, c]);
        }
      }

      if (empties.length === 0) return;

      const [r, c] = empties[Math.floor(Math.random() * empties.length)];
      const value = Math.random() < 0.9 ? 2 : 4;
      this._spawnTile(r, c, value, { isNew });
    }

    _spawnTile(row, col, value, { isNew }) {
      const id = this.nextId;
      this.nextId += 1;

      const el = document.createElement("div");
      el.className = `tile v${value}`;
      el.dataset.id = String(id);

      const inner = document.createElement("div");
      inner.className = "tile-inner";
      inner.textContent = String(value);
      el.appendChild(inner);

      const tile = { id, value, row, col, el, inner };
      this.tiles.set(id, tile);
      this.grid[row][col] = id;

      this._updateTileAppearance(tile);

      const { x, y } = this._cellToPixels(row, col);
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`;

      this.tileContainerEl.appendChild(el);

      if (isNew) this._playTileAnim(el, "new");

      return tile;
    }

    _updateTileAppearance(tile) {
      tile.el.classList.remove(...Array.from(tile.el.classList).filter((c) => c.startsWith("v")));
      tile.el.classList.add(`v${tile.value}`);

      tile.inner.textContent = String(tile.value);
      tile.inner.style.background = this._tileColor(tile.value);
    }

    _playTileAnim(tileEl, name) {
      tileEl.classList.remove(name);
      void tileEl.offsetWidth;
      tileEl.classList.add(name);

      const inner = tileEl.querySelector(".tile-inner");
      const onEnd = () => {
        tileEl.classList.remove(name);
        inner?.removeEventListener("animationend", onEnd);
      };

      inner?.addEventListener("animationend", onEnd);
    }

    _cellToPixels(row, col) {
      const { gap, cell } = this._metrics;
      return {
        x: col * (cell + gap),
        y: row * (cell + gap),
      };
    }

    _tileColor(value) {
      if (value === 0) return "var(--tile-0)";
      if (KNOWN_TILE_VALUES.has(value)) return `var(--tile-${value})`;
      return "#3c3a32";
    }

    _hasMoves() {
      for (let r = 0; r < SIZE; r += 1) {
        for (let c = 0; c < SIZE; c += 1) {
          const id = this.grid[r][c];
          if (id == null) return true;
          const t = this.tiles.get(id);
          if (!t) continue;

          const rightId = c + 1 < SIZE ? this.grid[r][c + 1] : null;
          const downId = r + 1 < SIZE ? this.grid[r + 1][c] : null;

          const right = rightId != null ? this.tiles.get(rightId) : null;
          const down = downId != null ? this.tiles.get(downId) : null;

          if ((right && right.value === t.value) || (down && down.value === t.value)) return true;
        }
      }
      return false;
    }

    _hasValueAtLeast(x) {
      for (const t of this.tiles.values()) {
        if (t.value >= x) return true;
      }
      return false;
    }

    _updateHUD() {
      if (this.scoreEl.textContent !== String(this.score)) {
        this.scoreEl.classList.add("updating");
        this.scoreEl.textContent = String(this.score);
        setTimeout(() => this.scoreEl.classList.remove("updating"), 250);
      }

      this.bestEl.textContent = String(this.best);
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
