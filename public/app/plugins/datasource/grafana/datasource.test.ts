import { type AnnotationQueryRequest, type DataSourceInstanceSettings, dateTime } from '@grafana/data';
import { backendSrv } from 'app/core/services/backend_srv'; // will use the version in __mocks__

import { GrafanaDatasource } from './datasource';
import { type GrafanaAnnotationQuery, GrafanaAnnotationType, type GrafanaQuery } from './types';

jest.mock('@grafana/runtime', () => ({
  ...jest.requireActual('@grafana/runtime'),
  getBackendSrv: () => backendSrv,
  getTemplateSrv: () => ({
    replace: (val: string) => {
      return val.replace('$var2', 'replaced__delimiter__replaced2').replace('$var', 'replaced');
    },
  }),
}));

describe('grafana data source', () => {
  const getMock = jest.spyOn(backendSrv, 'get');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('when executing an annotations query', () => {
    // The Grafana annotation backend endpoint accepts query params where `tags`
    // is a string array (after template-variable interpolation). The captured
    // params shape is narrower than the runtime-level `Record<string, unknown>`
    // typing on `BackendSrvRequest.params`, so we narrow here.
    let calledBackendSrvParams: { tags?: string[] } | undefined;
    let ds: GrafanaDatasource;
    beforeEach(() => {
      getMock.mockImplementation((url, options) => {
        calledBackendSrvParams = options as { tags?: string[] } | undefined;
        return Promise.resolve([]);
      });

      ds = new GrafanaDatasource({} as DataSourceInstanceSettings);
    });

    describe('with tags that have template variables', () => {
      const options = setupAnnotationQueryOptions({ tags: ['tag1:$var'] });

      beforeEach(() => {
        return ds.getAnnotations(options);
      });

      it('should interpolate template variables in tags in query options', () => {
        // `tags` is typed as optional on the narrowed test-local type because
        // the dashboard-annotation case below intentionally omits it; chain the
        // optional accessor through the array index as well.
        expect(calledBackendSrvParams?.tags?.[0]).toBe('tag1:replaced');
      });
    });

    describe('with tags that have multi value template variables', () => {
      const options = setupAnnotationQueryOptions({ tags: ['$var2'] });

      beforeEach(() => {
        return ds.getAnnotations(options);
      });

      it('should interpolate template variables in tags in query options', () => {
        // See note above on optional-chaining the array index.
        expect(calledBackendSrvParams?.tags?.[0]).toBe('replaced');
        expect(calledBackendSrvParams?.tags?.[1]).toBe('replaced2');
      });
    });

    describe('with type dashboard', () => {
      const options = setupAnnotationQueryOptions(
        {
          type: GrafanaAnnotationType.Dashboard,
          tags: ['tag1'],
        },
        { uid: 'DSNdW0gVk' }
      );

      beforeEach(() => {
        return ds.getAnnotations(options);
      });

      it('should remove tags from query options', () => {
        expect(calledBackendSrvParams?.tags).toBe(undefined);
      });
    });
  });
});

function setupAnnotationQueryOptions(annotation: Partial<GrafanaAnnotationQuery>, dashboard?: { uid: string }) {
  return {
    annotation: {
      target: annotation,
    },
    dashboard,
    range: {
      from: dateTime(1432288354),
      to: dateTime(1432288401),
    },
    rangeRaw: { from: 'now-24h', to: 'now' },
  } as unknown as AnnotationQueryRequest<GrafanaQuery>;
}
