import { useCallback, useReducer, useRef } from 'react';

import {
  compareArrayValues,
  compareDataFrameStructures,
  fieldReducers,
  getFieldDisplayName,
  getFrameDisplayName,
  type PanelData,
  type PanelProps,
  ReducerID,
} from '@grafana/data';
import { Trans, t } from '@grafana/i18n';
import { type Column, IconButton, InteractiveTable } from '@grafana/ui';

import { type Options, type UpdateConfig } from './panelcfg.gen';

type Props = PanelProps<Options>;

type UpdateCounters = {
  [K in keyof UpdateConfig]: number;
};

interface FieldRow {
  id: string;
  field: string;
  type: string;
  last: string;
}

export function RenderInfoViewer(props: Props) {
  const { data, options } = props;

  // Intentionally not state to avoid overhead -- yes, things will be 1 tick behind
  const lastRenderRef = useRef(Date.now());
  const countersRef = useRef<UpdateCounters>({
    render: 0,
    dataChanged: 0,
    schemaChanged: 0,
  });
  const prevDataRef = useRef<PanelData | undefined>(undefined);
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

  // Equivalent of class shouldComponentUpdate side-effect: detect data/schema changes vs previous render.
  // The manual diff runs inline during render (not in useEffect) because the side-effect mutates a ref
  // (not React state) and must be visible in the SAME render that observes the new data — matching the
  // original shouldComponentUpdate timing where the counter increment was visible in the subsequent render.
  const prevData = prevDataRef.current;
  if (prevData !== undefined && prevData !== data) {
    countersRef.current.dataChanged++;

    if (options.counters?.schemaChanged) {
      const oldSeries = prevData.series;
      const series = data.series;
      if (series && oldSeries) {
        const sameStructure = compareArrayValues(series, oldSeries, compareDataFrameStructures);
        if (!sameStructure) {
          countersRef.current.schemaChanged++;
        }
      }
    }
  }
  prevDataRef.current = data;

  const resetCounters = useCallback(() => {
    countersRef.current = {
      render: 0,
      dataChanged: 0,
      schemaChanged: 0,
    };
    forceUpdate();
  }, []);

  const showCounters = options.counters ?? {
    render: false,
    dataChanged: false,
    schemaChanged: false,
  };
  countersRef.current.render++;
  const now = Date.now();
  const elapsed = now - lastRenderRef.current;
  lastRenderRef.current = now;

  const reducer = fieldReducers.get(ReducerID.lastNotNull);

  const fieldColumns: Array<Column<FieldRow>> = [
    { id: 'field', header: t('debug.render-info-viewer.field', 'Field') },
    { id: 'type', header: t('debug.render-info-viewer.type', 'Type') },
    { id: 'last', header: t('debug.render-info-viewer.last', 'Last') },
  ];

  return (
    <div>
      <div>
        <IconButton
          name="step-backward"
          title={t('debug.render-info-viewer.title-reset-counters', 'Reset counters')}
          onClick={resetCounters}
          tooltip={t('debug.render-info-viewer.tooltip-step-back', 'Step back')}
        />
        <span>
          {showCounters.render && (
            <span>
              <Trans
                i18nKey="debug.render-info-viewer.render-counter"
                values={{ numRenders: countersRef.current.render }}
              >
                Render: {'{{numRenders}}'}&nbsp;
              </Trans>
            </span>
          )}
          {showCounters.dataChanged && (
            <span>
              <Trans
                i18nKey="debug.render-info-viewer.data-counter"
                values={{ numDataChanges: countersRef.current.dataChanged }}
              >
                Data: {'{{numDataChanges}}'}&nbsp;
              </Trans>
            </span>
          )}
          {showCounters.schemaChanged && (
            <span>
              <Trans
                i18nKey="debug.render-info-viewer.schema-counter"
                values={{ numSchemaChanges: countersRef.current.schemaChanged }}
              >
                Schema: {'{{numSchemaChanges}}'}&nbsp;
              </Trans>
            </span>
          )}
          <span>
            <Trans i18nKey="debug.render-info-viewer.elapsed-time">Time: {{ elapsed }}ms</Trans>
          </span>
        </span>
      </div>

      {data.series &&
        data.series.map((frame, idx) => {
          const rows: FieldRow[] = frame.fields.map((field, fIdx) => ({
            id: `${fIdx}/${field.name}`,
            field: getFieldDisplayName(field, frame, data.series),
            type: field.type,
            last: `${reducer.reduce!(field, false, false)[reducer.id]}`,
          }));
          return (
            <div key={`${idx}/${frame.refId}`}>
              <h4>
                {getFrameDisplayName(frame, idx)} ({frame.length})
              </h4>
              <InteractiveTable columns={fieldColumns} data={rows} getRowId={(row) => row.id} />
            </div>
          );
        })}
    </div>
  );
}
