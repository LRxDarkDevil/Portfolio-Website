import { installMechanicalMotion } from "./project-reel-motion.js";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function subtleBackEase(t) {
  const overshoot = 0.72;
  const shifted = t - 1;
  return 1 + (overshoot + 1) * shifted ** 3 + overshoot * shifted ** 2;
}

function shapeDetent(position) {
  const lower = Math.floor(position);
  const fraction = position - lower;

  if (fraction <= 0.5) {
    return lower + 0.5 * (fraction / 0.5) ** 1.7;
  }

  return lower + 1 - 0.5 * ((1 - fraction) / 0.5) ** 1.7;
}

class MechanicalProjectReel {
  constructor(section) {
    this.section = section;
    this.grid = section.querySelector("#project-grid");
    this.cards = [...section.querySelectorAll(".project-card[data-category]")];
    this.filterButtons = [...section.querySelectorAll("[data-filter]")];
    this.mediaQuery = window.matchMedia("(prefers-reduced-motion: no-preference)");
    this.compactQuery = window.matchMedia("(max-width: 47.999rem)");

    this.enabled = false;
    this.visibleCards = [];
    this.activeIndex = 0;
    this.rawPosition = 0;
    this.physicalPosition = 0;
    this.velocity = 0;
    this.scrollDirection = 1;
    this.lastRawPosition = 0;
    this.stepHeight = 0;
    this.reelTop = 0;
    this.maxScroll = 0;
    this.frameId = null;
    this.scrollTimer = null;
    this.resizeTimer = null;
    this.settleFrameId = null;
    this.isSettling = false;
    this.isPointerDown = false;
    this.originalGridParent = this.grid?.parentNode || null;
    this.originalGridNextSibling = this.grid?.nextSibling || null;

    this.handleMediaChange = this.handleMediaChange.bind(this);
    this.handleScroll = this.handleScroll.bind(this);
    this.handleResize = this.handleResize.bind(this);
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.render = this.render.bind(this);
  }

  start() {
    if (!this.grid || this.cards.length < 2) {
      return;
    }

    this.mediaQuery.addEventListener("change", this.handleMediaChange);
    this.handleMediaChange();
  }

  handleMediaChange() {
    if (this.mediaQuery.matches) {
      this.enable();
    } else {
      this.disable();
    }
  }

  enable() {
    if (this.enabled) {
      return;
    }

    this.enabled = true;
    this.section.classList.add("project-reel-enabled");
    document.documentElement.classList.add("project-reel-supported");

    this.buildMachine();
    this.wrapCardSurfaces();
    this.refreshVisibleCards({ preserveCard: false, alignScroll: false });

    this.cards.forEach((card) => {
      card.classList.remove("motion-reveal-ready", "is-revealing");
      card.style.removeProperty("--reveal-index");
    });

    this.mutationObserver = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => mutation.attributeName === "hidden")) {
        window.requestAnimationFrame(() => {
          this.refreshVisibleCards({ preserveCard: true, alignScroll: true });
        });
      }
    });

    this.cards.forEach((card) => {
      this.mutationObserver.observe(card, { attributes: true, attributeFilter: ["hidden"] });
    });

    window.addEventListener("scroll", this.handleScroll, { passive: true });
    window.addEventListener("resize", this.handleResize, { passive: true });
    window.addEventListener("pointerdown", this.handlePointerDown, { passive: true });
    window.addEventListener("pointerup", this.handlePointerUp, { passive: true });
    window.addEventListener("pointercancel", this.handlePointerUp, { passive: true });
    window.addEventListener("touchend", this.handlePointerUp, { passive: true });

    this.measure({ preservePosition: false });
    this.handleScroll();
  }

  disable() {
    if (!this.enabled) {
      return;
    }

    this.enabled = false;
    this.cancelSettle();
    window.clearTimeout(this.scrollTimer);
    window.clearTimeout(this.resizeTimer);

    if (this.frameId) {
      window.cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }

    this.mutationObserver?.disconnect();
    window.removeEventListener("scroll", this.handleScroll);
    window.removeEventListener("resize", this.handleResize);
    window.removeEventListener("pointerdown", this.handlePointerDown);
    window.removeEventListener("pointerup", this.handlePointerUp);
    window.removeEventListener("pointercancel", this.handlePointerUp);
    window.removeEventListener("touchend", this.handlePointerUp);

    this.cards.forEach((card) => {
      card.removeAttribute("aria-current");
      card.removeAttribute("aria-hidden");
      card.inert = false;
      card.style.cssText = "";

      card.querySelectorAll("a, button").forEach((control) => {
        if (control.dataset.reelTabindex !== undefined) {
          const previous = control.dataset.reelTabindex;
          if (previous === "") {
            control.removeAttribute("tabindex");
          } else {
            control.setAttribute("tabindex", previous);
          }
          delete control.dataset.reelTabindex;
        }
      });
    });

    this.unwrapCardSurfaces();

    if (this.originalGridParent && this.shell?.parentNode) {
      this.originalGridParent.insertBefore(this.grid, this.originalGridNextSibling);
    }

    this.shell?.remove();
    this.section.classList.remove("project-reel-enabled");
    document.documentElement.classList.remove("project-reel-supported", "project-reel-programmatic-scroll");
  }

  buildMachine() {
    this.shell = document.createElement("div");
    this.shell.className = "project-reel";
    this.shell.dataset.projectReel = "";

    this.sticky = document.createElement("div");
    this.sticky.className = "project-reel__sticky";

    const toolbar = document.createElement("div");
    toolbar.className = "project-reel__toolbar";
    toolbar.innerHTML = `
      <div class="project-reel__identity" aria-hidden="true">
        <span class="project-reel__signal"></span>
        <span>Manual archive drive</span>
      </div>
      <div class="project-reel__counter" aria-hidden="true">
        <span class="project-reel__counter-label">Project</span>
        <span class="project-reel__counter-window">
          <span class="project-reel__counter-strip"></span>
        </span>
        <span class="project-reel__counter-total">/ 00</span>
      </div>
      <div class="project-reel__controls">
        <button class="project-reel__button project-reel__button--previous" type="button" aria-label="Show previous project">↑</button>
        <button class="project-reel__button project-reel__button--next" type="button" aria-label="Show next project">↓</button>
      </div>
    `;

    this.counterStrip = toolbar.querySelector(".project-reel__counter-strip");
    this.counterTotal = toolbar.querySelector(".project-reel__counter-total");
    this.previousButton = toolbar.querySelector(".project-reel__button--previous");
    this.nextButton = toolbar.querySelector(".project-reel__button--next");

    for (let index = 0; index <= 99; index += 1) {
      const row = document.createElement("span");
      row.textContent = String(index).padStart(2, "0");
      this.counterStrip.append(row);
    }

    this.stage = document.createElement("div");
    this.stage.className = "project-reel__stage";

    this.machine = document.createElement("div");
    this.machine.className = "project-reel__machine";
    this.machine.innerHTML = `
      <div class="project-reel__machine-label" aria-hidden="true">
        <span>INDEX / SELECTED WORK</span>
        <span>DETENT 08—M</span>
      </div>
      <span class="project-reel__screw project-reel__screw--tl" aria-hidden="true"></span>
      <span class="project-reel__screw project-reel__screw--tr" aria-hidden="true"></span>
      <span class="project-reel__screw project-reel__screw--bl" aria-hidden="true"></span>
      <span class="project-reel__screw project-reel__screw--br" aria-hidden="true"></span>
      <span class="project-reel__axle project-reel__axle--left" aria-hidden="true"></span>
      <span class="project-reel__axle project-reel__axle--right" aria-hidden="true"></span>
      <div class="project-reel__drum-window"></div>
    `;

    this.drumWindow = this.machine.querySelector(".project-reel__drum-window");

    this.indexRail = document.createElement("ol");
    this.indexRail.className = "project-reel__index";
    this.indexRail.setAttribute("aria-label", "Project index");

    this.liveRegion = document.createElement("p");
    this.liveRegion.className = "sr-only";
    this.liveRegion.setAttribute("aria-live", "polite");
    this.liveRegion.setAttribute("aria-atomic", "true");

    this.stage.append(this.machine, this.indexRail);
    this.sticky.append(toolbar, this.stage, this.liveRegion);
    this.shell.append(this.sticky);
    this.grid.parentNode?.insertBefore(this.shell, this.grid);
    this.drumWindow.append(this.grid);

    this.previousButton.addEventListener("click", () => this.settleToIndex(this.activeIndex - 1));
    this.nextButton.addEventListener("click", () => this.settleToIndex(this.activeIndex + 1));
  }

  wrapCardSurfaces() {
    this.cards.forEach((card, index) => {
      if (card.querySelector(":scope > .project-card__surface")) {
        return;
      }

      const surface = document.createElement("div");
      surface.className = "project-card__surface";
      surface.style.setProperty("--rest-tilt", `${[-0.28, 0.18, -0.12, 0.24, -0.2, 0.14, -0.08, 0.2][index % 8]}deg`);

      while (card.firstChild) {
        surface.append(card.firstChild);
      }

      card.append(surface);
    });
  }

  unwrapCardSurfaces() {
    this.cards.forEach((card) => {
      const surface = card.querySelector(":scope > .project-card__surface");
      if (!surface) {
        return;
      }

      while (surface.firstChild) {
        card.insertBefore(surface.firstChild, surface);
      }

      surface.remove();
    });
  }

  refreshVisibleCards({ preserveCard = true, alignScroll = true } = {}) {
    const wasInsideReel = this.enabled && this.shell ? this.isInsideReel() : false;
    const activeCard = preserveCard ? this.visibleCards[this.activeIndex] : null;
    this.visibleCards = this.cards.filter((card) => !card.hidden);

    this.visibleCards.forEach((card, index) => {
      card.dataset.reelIndex = String(index);
    });

    const preservedIndex = activeCard ? this.visibleCards.indexOf(activeCard) : -1;
    this.activeIndex = preservedIndex >= 0 ? preservedIndex : clamp(this.activeIndex, 0, Math.max(0, this.visibleCards.length - 1));

    this.rebuildIndexRail();
    this.counterTotal.textContent = `/ ${String(this.visibleCards.length).padStart(2, "0")}`;
    this.measure({ preservePosition: alignScroll, forceAlign: alignScroll && wasInsideReel });
    this.rawPosition = this.activeIndex;
    this.physicalPosition = this.activeIndex;
    this.velocity = 0;
    this.updateActiveProject(this.activeIndex, { announce: false, force: true });
    this.requestRender();
  }

  rebuildIndexRail() {
    this.indexRail.replaceChildren();

    this.visibleCards.forEach((card, index) => {
      const title = card.querySelector(".project-title")?.textContent?.trim() || `Project ${index + 1}`;
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "project-reel__index-button";
      button.setAttribute("aria-label", `Show ${title}`);
      button.innerHTML = `<span>${String(index + 1).padStart(2, "0")}</span><i aria-hidden="true"></i>`;
      button.addEventListener("click", () => this.settleToIndex(index));
      item.append(button);
      this.indexRail.append(item);
    });

    this.indexButtons = [...this.indexRail.querySelectorAll("button")];
  }

  measure({ preservePosition = true, forceAlign = false } = {}) {
    if (!this.enabled || !this.shell) {
      return;
    }

    const preservedIndex = preservePosition ? this.activeIndex : null;
    const compact = this.compactQuery.matches;
    const stickyStyle = window.getComputedStyle(this.sticky);
    const stickyOffset = Number.parseFloat(stickyStyle.insetBlockStart || stickyStyle.top) || 0;
    const stickyHeight = Math.ceil(this.sticky.getBoundingClientRect().height);

    this.stepHeight = compact
      ? clamp(window.innerHeight * 0.64, 340, 590)
      : clamp(window.innerHeight * 0.72, 460, 760);
    this.maxScroll = this.stepHeight * Math.max(0, this.visibleCards.length - 1);
    this.shell.style.height = `${stickyHeight + this.maxScroll}px`;
    this.shell.style.setProperty("--project-count", String(this.visibleCards.length));
    this.reelTop = this.shell.getBoundingClientRect().top + window.scrollY - stickyOffset;

    if (preservedIndex !== null && (forceAlign || this.isInsideReel())) {
      window.scrollTo({ top: this.reelTop + preservedIndex * this.stepHeight, behavior: "auto" });
    }
  }

}

installMechanicalMotion(MechanicalProjectReel, { clamp, subtleBackEase, shapeDetent });


export function setupProjectReel() {
  const section = document.querySelector("#projects");
  if (!section) {
    return null;
  }

  const reel = new MechanicalProjectReel(section);
  reel.start();
  return reel;
}
