import { CircularVector } from '../vector/CircularVector';

import { MutableDataFrame } from './MutableDataFrame';

interface CircularOptions {
  append?: 'head' | 'tail';
  capacity?: number;
}

/**
 * This dataframe can have values constantly added, and will never
 * exceed the given capacity
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic default `T = any` preserved for back-compat: aligned with parent MutableDataFrame<T = any> default; consumers (Loki LiveStreams, testdata runStreams) instantiate `new CircularDataFrame({...})` without explicit T and pass row objects to `frame.add()` directly without narrowing
export class CircularDataFrame<T = any> extends MutableDataFrame<T> {
  constructor(options: CircularOptions) {
    super(undefined, (buffer) => {
      return new CircularVector({
        ...options,
        buffer,
      });
    });
  }
}
