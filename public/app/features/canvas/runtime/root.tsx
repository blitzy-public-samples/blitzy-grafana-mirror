import { Fragment } from 'react';

import { type CanvasFrameOptions } from '../frame';

import { FrameState } from './frame';
import { type Scene } from './scene';

export class RootElement extends FrameState {
  constructor(
    public options: CanvasFrameOptions,
    public scene: Scene,
    private changeCallback: () => void
  ) {
    super(options, scene);

    this.sizeStyle = {
      height: '100%',
      width: '100%',
    };
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
      // Design system gap: dynamic class-state spread (this.sizeStyle, this.dataStyle)
      // populated at runtime by applyStyles in element.tsx; cannot be migrated to a static
      // or theme-aware css() class because values change per drag/resize/rotate frame.
      // Class context precludes useStyles2 hook usage (this is RootElement, a state-management
      // class, not a React function component).
      <div
        onContextMenu={(event) => event.preventDefault()}
        key={this.UID}
        ref={this.setRootRef}
        style={{ ...this.sizeStyle, ...this.dataStyle }}
      >
        {this.elements.map((v) => (
          <Fragment key={v.UID}>{v.renderElement()}</Fragment>
        ))}
      </div>
    );
  }
}
