export type KernelView = 'assay' | 'microscope' | 'architecture' | 'architecture-v2';
export type KernelNavActive = KernelView | 'review' | 'none';

type ViewLink = {
  key: KernelView;
  label: string;
  blurb: string;
};

const views: ViewLink[] = [
  { key: 'assay', label: 'Assay', blurb: 'work surface' },
  { key: 'microscope', label: 'Trace', blurb: 'single run' },
  { key: 'architecture', label: 'Architecture', blurb: 'system map' },
  { key: 'architecture-v2', label: 'Architecture v2', blurb: 'engineer map' },
];

export type KernelViewHrefs = Record<KernelView, string>;

export function renderViewNav(
  active: KernelNavActive,
  hrefs: KernelViewHrefs,
  options: { hubHref?: string; hubLabel?: string; reviewHref?: string } = {},
): string {
  const assay = views[0];
  const assayActive = assay.key === active ? ' is-active' : '';
  const reviewActive = active === 'review' ? ' is-active' : '';
  const review = options.reviewHref
    ? `<a class="kernel-view-link${reviewActive}" href="${options.reviewHref}">Review<small>saved verdicts</small></a>`
    : '';
  const advanced = views.slice(1)
    .map((view) => {
      const activeClass = view.key === active ? ' is-active' : '';
      return `<a class="kernel-view-link${activeClass}" href="${hrefs[view.key]}">${view.label}<small>${view.blurb}</small></a>`;
    })
    .join('');
  const hubHref = options.hubHref || '';
  const hub = hubHref
    ? `<a class="kernel-view-hub" href="${hubHref}">${options.hubLabel || 'Hub'}</a>`
    : '';

  return `<!-- kernel-view-nav:start -->
<style>
.kernel-view-nav{position:sticky;top:0;z-index:2147483647;display:flex;gap:.45rem;align-items:center;flex-wrap:wrap;padding:.55rem .8rem;background:#0b0e13;border-bottom:1px solid #2a3544;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;font-size:.85rem;line-height:1.2;}
.kernel-view-nav strong{color:#8b9bb0;font-size:.72rem;text-transform:uppercase;letter-spacing:.07em;margin-right:.35rem;}
.kernel-view-nav a,.kernel-view-nav summary{color:#e8edf4;text-decoration:none;border-radius:6px;padding:.34rem .62rem;white-space:nowrap;cursor:pointer;}
.kernel-view-nav a small{margin-left:.35rem;color:#8b9bb0;font-weight:400;}
.kernel-view-nav a:hover,.kernel-view-nav summary:hover{background:#1b232e;color:#c084fc;}
.kernel-view-nav a:hover small{color:#c084fc;}
.kernel-view-nav a.is-active{background:#c084fc;color:#0b0e13;font-weight:700;}
.kernel-view-nav a.is-active small{color:#0b0e13;}
.kernel-view-nav .kernel-view-hub{margin-left:auto;color:#8b9bb0;}
.kernel-view-more{position:relative;}
.kernel-view-more summary{list-style:none;color:#8b9bb0;}
.kernel-view-more summary::-webkit-details-marker{display:none;}
.kernel-view-more summary::after{content:"...";margin-left:.25rem;}
.kernel-view-more[open] summary{background:#1b232e;color:#c084fc;}
.kernel-view-more div{position:absolute;top:calc(100% + .35rem);left:0;display:grid;gap:.25rem;min-width:220px;padding:.35rem;border:1px solid #2a3544;border-radius:8px;background:#0b0e13;box-shadow:0 10px 25px rgba(0,0,0,.24);}
.kernel-view-more div a{display:block;}
@media (max-width:700px){.kernel-view-nav a small{display:none}.kernel-view-nav .kernel-view-hub{margin-left:0}.kernel-view-more{position:static}.kernel-view-more div{position:static;display:flex;flex-wrap:wrap;min-width:0;box-shadow:none}}
</style>
<nav class="kernel-view-nav" aria-label="Kernel view navigation">
  <strong>Kernel</strong><a class="kernel-view-link${assayActive}" href="${hrefs.assay}">Assay<small>${assay.blurb}</small></a>${review}<details class="kernel-view-more"><summary>Advanced</summary><div>${advanced}</div></details>${hub}
</nav>
<!-- kernel-view-nav:end -->`;
}

export function stripViewNav(html: string): string {
  return html.replace(/<!-- kernel-view-nav:start -->[\s\S]*?<!-- kernel-view-nav:end -->/g, '');
}
