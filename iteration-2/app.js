const revealElements = document.querySelectorAll(".reveal");
const metricValues = document.querySelectorAll("[data-count]");

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      }
    });
  },
  {
    threshold: 0.18,
  }
);

revealElements.forEach((element) => revealObserver.observe(element));

function animateMetric(element) {
  const finalText = element.textContent.trim();
  const target = Number.parseFloat(element.dataset.count || "0");

  if (!Number.isFinite(target)) {
    return;
  }

  const hasCurrency = finalText.startsWith("$");
  const hasMillionSuffix = finalText.endsWith("M");
  const duration = 1200;
  const start = performance.now();

  function frame(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - (1 - progress) ** 3;
    const value = target * eased;

    if (hasCurrency && hasMillionSuffix) {
      element.textContent = `$${value.toFixed(1)}M`;
    } else {
      element.textContent = Math.round(value).toString();
    }

    if (progress < 1) {
      window.requestAnimationFrame(frame);
    } else {
      element.textContent = finalText;
    }
  }

  window.requestAnimationFrame(frame);
}

const metricObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        animateMetric(entry.target);
        metricObserver.unobserve(entry.target);
      }
    });
  },
  {
    threshold: 0.6,
  }
);

metricValues.forEach((metric) => metricObserver.observe(metric));
