const projectFilters = [...document.querySelectorAll("[data-filter]")];
const projectCards = [...document.querySelectorAll(".project-card[data-category]")];
const filterStatus = document.querySelector("#filter-status");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let filterTimerId;

function setupViewportReveals() {
    const wideViewport = window.matchMedia("(min-width: 40rem)");
    if (reducedMotion.matches || !wideViewport.matches || !("IntersectionObserver" in window)) {
        return;
    }

    const revealGroups = [
        [...document.querySelectorAll(".capability-list li")],
        [...document.querySelectorAll(".visual-archive figure")],
        projectCards,
        [
            document.querySelector(".contact-art"),
            document.querySelector(".contact-title"),
            document.querySelector(".contact-section .button"),
            ...document.querySelectorAll(".contact-links li"),
        ].filter(Boolean),
    ];
    const backgroundSections = [
        document.querySelector(".practice"),
        document.querySelector(".work-section"),
    ].filter(Boolean);

    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) {
                return;
            }

            const item = entry.target;
            item.classList.add("is-revealing");
            item.addEventListener("animationend", () => {
                item.classList.remove("motion-reveal-ready", "is-revealing");
                item.style.removeProperty("--reveal-index");
            }, { once: true });
            revealObserver.unobserve(item);
        });
    }, {
        rootMargin: "0px 0px -8% 0px",
        threshold: 0.08,
    });

    revealGroups.forEach((group) => {
        group.forEach((item, index) => {
            item.classList.add("motion-reveal-ready");
            item.style.setProperty("--reveal-index", String(Math.min(index, 5)));
            revealObserver.observe(item);
        });
    });

    const backgroundObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) {
                return;
            }

            entry.target.classList.add("background-in-view");
            backgroundObserver.unobserve(entry.target);
        });
    }, {
        rootMargin: "0px 0px -12% 0px",
        threshold: 0.12,
    });

    backgroundSections.forEach((section) => {
        section.classList.add("background-motion-ready");
        backgroundObserver.observe(section);
    });
}

function applyProjectFilter(filter) {
    window.clearTimeout(filterTimerId);

    const visibleCards = projectCards.filter((card) => {
        return filter === "all" || card.dataset.category === filter;
    });

    projectFilters.forEach((button) => {
        button.setAttribute("aria-pressed", String(button.dataset.filter === filter));
    });

    const updateCards = () => {
        projectCards.forEach((card) => {
            const shouldShow = visibleCards.includes(card);
            card.hidden = !shouldShow;
            card.classList.remove("is-filtering-out");
        });

        if (filterStatus) {
            const label = filter === "all" ? "all" : filter.replace("-", " ");
            filterStatus.textContent = `Showing ${visibleCards.length} ${label} ${visibleCards.length === 1 ? "project" : "projects"}.`;
        }
    };

    if (reducedMotion.matches) {
        updateCards();
        return;
    }

    projectCards.forEach((card) => card.classList.add("is-filtering-out"));
    filterTimerId = window.setTimeout(updateCards, 120);
}

projectFilters.forEach((button) => {
    button.addEventListener("click", () => applyProjectFilter(button.dataset.filter));
});

setupViewportReveals();

const currentYear = document.querySelector("#current-year");
if (currentYear) {
    currentYear.textContent = new Date().getFullYear();
}
