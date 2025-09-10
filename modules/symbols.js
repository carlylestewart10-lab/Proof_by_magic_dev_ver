(function () {
  const triangleSVG = (filled, size, strokeW) => `
    <svg part="svg" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 20 L12 4 L21 20 Z"
            fill="${filled ? 'currentColor' : 'none'}"
            stroke="currentColor" stroke-width="${strokeW}" />
    </svg>`;

  const arrowSVG = (filled, size, strokeW) => `
    <svg part="svg" width="${size}" height="${size}" viewBox="0 0 28 24" aria-hidden="true">
      <line x1="3" y1="12" x2="18" y2="12" stroke="currentColor" stroke-width="${strokeW}" />
      <path d="M18 6 L25 12 L18 18 Z"
            fill="${filled ? 'currentColor' : 'none'}"
            stroke="currentColor" stroke-width="${strokeW}" />
    </svg>`;

  class PBMIconBase extends HTMLElement {
    static get observedAttributes() { return ['size','stroke']; }
    connectedCallback() { this.render(); }
    attributeChangedCallback() { this.render(); }
    get _size()  {
      const v = this.getAttribute('size') || '1.5em'; // inherits font-size by default
      return /^\d+(\.\d+)?$/.test(v) ? v + 'px' : v; // allow "20" or "20px" or "1.25em"
    }
    get _stroke() { return this.getAttribute('stroke') || '2'; }
    render() {
      const size = this._size;
      const strokeW = this._stroke;
      const svg = this._svg(size, strokeW);
      // Shadow DOM for easy styling + isolation
      if (!this.shadowRoot) this.attachShadow({mode: 'open'});
      this.shadowRoot.innerHTML = `
        <style>
          :host { display:inline-block; line-height:0; color: currentColor; }
          svg { display:block; }
        </style>
        ${svg}
      `;
    }
    // subclasses implement _svg(size, strokeW)
  }

  class PBMAnd extends PBMIconBase {
    _svg(size, strokeW) { return triangleSVG(false, size, strokeW); } // outline triangle
  }
  class PBMReverseAnd extends PBMIconBase {
    _svg(size, strokeW) { return triangleSVG(true, size, strokeW); }  // filled triangle
  }
  class PBMImp extends PBMIconBase {
    _svg(size, strokeW) { return arrowSVG(false, size, strokeW); }    // empty arrowhead  (-|>)
  }
  class PBMMP extends PBMIconBase {
    _svg(size, strokeW) { return arrowSVG(true, size, strokeW); }     // filled arrowhead
  }

  // Register elements once
  if (!customElements.get('pbm-and'))          customElements.define('pbm-and', PBMAnd);
  if (!customElements.get('pbm-reverse-and'))  customElements.define('pbm-reverse-and', PBMReverseAnd);
  if (!customElements.get('pbm-imp'))          customElements.define('pbm-imp', PBMImp);
  if (!customElements.get('pbm-mp'))           customElements.define('pbm-mp', PBMMP);
})();