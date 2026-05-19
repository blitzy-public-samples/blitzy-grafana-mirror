import { css } from '@emotion/css';
import { Fragment } from 'react';

import { type CanvasFrameOptions } from '../frame';

import { FrameState } from './frame';
import { type Scene } from './scene';

/**
 * Static size style for the canvas root element. Extracted to a module-level
 * Emotion class (per AAP §0.5.3 styling migration) so the React render no
 * longer contains the constant `height: 100%; width: 100%` inline style.
 * The original `sizeStyle` field on RootElement is preserved as a no-op
 * empty CSSProperties object purely to keep the class-shape stable for any
 * subclass or external consumer that reads `instance.sizeStyle` (no in-repo
 * consumers exist, but minimal-change mandate avoids changing the field's
 * existence/type). All runtime size mutations performed by
 * `applyStyles(this.sizeStyle, this.div)` in element.tsx continue to work
 * because they Object.assign onto the DOM `style` attribute and the empty
 * object is a no-op assignment.
 */
const rootStyles = css({
  height: '100%',
  width: '100%',
});

export class RootElement extends FrameState {
  constructor(
    public options: CanvasFrameOptions,
    public scene: Scene,
    private changeCallback: () => void
  ) {
    super(options, scene);

    // sizeStyle intentionally left as the inherited empty object — the static
    // `height/width: 100%` is now applied via the rootStyles className below.
  }

  isRoot(): this is RootElement {
    return true;
  }

  // root type can not change
  onChange(options: CanvasFrameOptions) {
    this.revId++;
    this.options = { ...options };
    this.changeCallback();
  }

  getSaveModel(): CanvasFrameOptions {
    const { placement, constraint, ...rest } = this.options;

    return {
      ...rest, // everything except placement & constraint
      elements: this.elements.map((v) => v.getSaveModel()),
    };
  }

  setRootRef = (target: HTMLDivElement) => {
    this.div = target;
  };

  renderElement() {
    return (
      // Static sizing is provided by the module-level `rootStyles` Emotion class.
      // The remaining inline `style={this.dataStyle}` carries the per-frame
      // data-driven style object that element.tsx mutates via
      // `applyStyles(this.dataStyle, this.div)` on every drag/resize/data update.
      // Migrating this dynamic per-frame style to Emotion would generate a new
      // class per frame; this is the documented exception per AAP §0.8.9
      // and the inline `style` spread is the correct minimal pattern here.
      <div
        onContextMenu={(event) => event.preventDefault()}
        key={this.UID}
        ref={this.setRootRef}
        className={rootStyles}
        style={this.dataStyle}
      >
        {this.elements.map((v) => (
          <Fragment key={v.UID}>{v.renderElement()}</Fragment>
        ))}
      </div>
    );
  }
}
