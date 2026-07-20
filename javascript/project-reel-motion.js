export function installMechanicalMotion(MechanicalProjectReel, { clamp, subtleBackEase, shapeDetent }) {
  Object.assign(MechanicalProjectReel.prototype, {
  handleResize() {
    window.clearTimeout(this.resizeTimer);
    this.resizeTimer = window.setTimeout(() => {
      if (this.mediaQuery.matches) {
        this.measure({ preservePosition: true });
        this.handleScroll();
      }
    }, 120);
  },

  handlePointerDown() {
    this.isPointerDown = true;
    this.cancelSettle();
  },

  handlePointerUp() {
    this.isPointerDown = false;
    this.scheduleSettle(180);
  },

  handleScroll() {
    if (!this.enabled || this.visibleCards.length === 0) {
      return;
    }

    const nextPosition = clamp((window.scrollY - this.reelTop) / Math.max(1, this.stepHeight), 0, this.visibleCards.length - 1);
    const delta = nextPosition - this.lastRawPosition;

    if (Math.abs(delta) > 0.001) {
      this.scrollDirection = delta > 0 ? 1 : -1;
    }

    this.rawPosition = nextPosition;
    this.lastRawPosition = nextPosition;
    this.requestRender();

    if (!this.isSettling && this.isInsideReel()) {
      this.scheduleSettle(260);
    }
  },

  isInsideReel() {
    return window.scrollY >= this.reelTop - 2 && window.scrollY <= this.reelTop + this.maxScroll + 2;
  },

  scheduleSettle(delay = 260) {
    if (this.isSettling || this.isPointerDown || !this.isInsideReel()) {
      return;
    }

    window.clearTimeout(this.scrollTimer);
    this.scrollTimer = window.setTimeout(() => this.settleFromCurrentPosition(), delay);
  },

  settleFromCurrentPosition() {
    if (this.isSettling || this.isPointerDown || this.visibleCards.length < 2) {
      return;
    }

    const lower = Math.floor(this.rawPosition);
    const fraction = this.rawPosition - lower;
    let target = lower;

    if (fraction > 0.001) {
      if (this.scrollDirection >= 0) {
        target = fraction >= 0.58 ? lower + 1 : lower;
      } else {
        target = fraction > 0.42 ? lower + 1 : lower;
      }
    }

    this.settleToIndex(target);
  },

  settleToIndex(index) {
    const targetIndex = clamp(index, 0, Math.max(0, this.visibleCards.length - 1));
    const targetY = this.reelTop + targetIndex * this.stepHeight;
    const startY = window.scrollY;
    const distance = targetY - startY;

    if (Math.abs(distance) < 1) {
      this.rawPosition = targetIndex;
      this.updateActiveProject(targetIndex);
      this.requestRender();
      return;
    }

    this.cancelSettle();
    this.isSettling = true;
    document.documentElement.classList.add("project-reel-programmatic-scroll");

    const duration = clamp(460 + Math.abs(distance) * 0.22, 500, 820);
    const startTime = performance.now();

    const step = (time) => {
      const elapsed = time - startTime;
      const progress = clamp(elapsed / duration, 0, 1);
      const eased = subtleBackEase(progress);
      window.scrollTo(0, startY + distance * eased);

      if (progress < 1) {
        this.settleFrameId = window.requestAnimationFrame(step);
        return;
      }

      window.scrollTo(0, targetY);
      this.rawPosition = targetIndex;
      this.lastRawPosition = targetIndex;
      this.isSettling = false;
      this.settleFrameId = null;
      document.documentElement.classList.remove("project-reel-programmatic-scroll");
      this.updateActiveProject(targetIndex);
      this.requestRender();
    };

    this.settleFrameId = window.requestAnimationFrame(step);
  },

  cancelSettle() {
    if (this.settleFrameId) {
      window.cancelAnimationFrame(this.settleFrameId);
      this.settleFrameId = null;
    }

    this.isSettling = false;
    document.documentElement.classList.remove("project-reel-programmatic-scroll");
  },

  requestRender() {
    if (!this.frameId) {
      this.frameId = window.requestAnimationFrame(this.render);
    }
  },

  render() {
    this.frameId = null;

    const stiffness = this.isSettling ? 0.12 : 0.085;
    const damping = this.isSettling ? 0.74 : 0.7;
    this.velocity += (this.rawPosition - this.physicalPosition) * stiffness;
    this.velocity *= damping;
    this.physicalPosition += this.velocity;

    if (Math.abs(this.rawPosition - this.physicalPosition) < 0.0004 && Math.abs(this.velocity) < 0.0004) {
      this.physicalPosition = this.rawPosition;
      this.velocity = 0;
    }

    const displayPosition = shapeDetent(clamp(this.physicalPosition, 0, Math.max(0, this.visibleCards.length - 1)));
    const stageHeight = this.stage?.clientHeight || window.innerHeight * 0.72;
    const radius = clamp(stageHeight * 0.72, 360, 610);

    this.visibleCards.forEach((card, index) => {
      const delta = index - displayPosition;
      const angle = clamp(delta * 54, -86, 86);
      const radians = angle * (Math.PI / 180);
      const y = Math.sin(radians) * radius;
      const z = (Math.cos(radians) - 1) * radius;
      const distance = Math.abs(delta);
      const opacity = clamp(1 - distance * 0.64, 0, 1);
      const scale = 1 - Math.min(distance * 0.055, 0.12);

      card.style.setProperty("--reel-y", `${y.toFixed(2)}px`);
      card.style.setProperty("--reel-z", `${z.toFixed(2)}px`);
      card.style.setProperty("--reel-angle", `${(-angle).toFixed(2)}deg`);
      card.style.setProperty("--reel-opacity", opacity.toFixed(3));
      card.style.setProperty("--reel-scale", scale.toFixed(3));
      card.style.setProperty("--reel-depth", String(Math.max(1, 100 - Math.round(distance * 30))));
    });

    const roundedIndex = clamp(Math.round(displayPosition), 0, Math.max(0, this.visibleCards.length - 1));
    this.updateActiveProject(roundedIndex, { announce: false });

    this.sticky.style.setProperty("--counter-position", displayPosition.toFixed(4));
    this.sticky.style.setProperty("--drum-turn", `${(displayPosition * 37).toFixed(2)}deg`);
    this.sticky.style.setProperty("--mechanical-load", String(Math.min(1, Math.abs(this.rawPosition - displayPosition) * 2.2)));

    if (this.velocity !== 0 || Math.abs(this.rawPosition - this.physicalPosition) >= 0.0004) {
      this.requestRender();
    }
  },

  updateActiveProject(index, { announce = true, force = false } = {}) {
    if (!force && index === this.activeIndex && this.visibleCards[index]?.getAttribute("aria-current") === "true") {
      return;
    }

    this.activeIndex = index;

    this.cards.forEach((card) => {
      const visibleIndex = this.visibleCards.indexOf(card);
      const isActive = visibleIndex === index;
      const isVisible = visibleIndex >= 0;

      if (isActive) {
        card.setAttribute("aria-current", "true");
      } else {
        card.removeAttribute("aria-current");
      }
      card.setAttribute("aria-hidden", String(!isActive));
      card.inert = !isActive || !isVisible;

      card.querySelectorAll("a, button").forEach((control) => {
        if (control.dataset.reelTabindex === undefined) {
          control.dataset.reelTabindex = control.getAttribute("tabindex") || "";
        }

        if (isActive) {
          const previous = control.dataset.reelTabindex;
          if (previous === "") {
            control.removeAttribute("tabindex");
          } else {
            control.setAttribute("tabindex", previous);
          }
        } else {
          control.setAttribute("tabindex", "-1");
        }
      });
    });

    this.indexButtons?.forEach((button, buttonIndex) => {
      button.setAttribute("aria-current", buttonIndex === index ? "true" : "false");
    });

    this.previousButton.disabled = index <= 0;
    this.nextButton.disabled = index >= this.visibleCards.length - 1;

    const activeCard = this.visibleCards[index];
    const title = activeCard?.querySelector(".project-title")?.textContent?.trim();
    if (announce && title) {
      this.liveRegion.textContent = `Project ${index + 1} of ${this.visibleCards.length}: ${title}`;
    }
  }
  });
}
