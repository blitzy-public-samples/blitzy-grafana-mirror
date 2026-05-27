import { concat, every, find, groupBy, head, map, partition } from 'lodash';

/**
 * Annotations from alerting include an extra `eventType` discriminator
 * (e.g. `'panel-alert'`) that is not part of `@grafana/data`'s `AnnotationEvent`.
 * The dedup logic below references that field, so we accept any compatible
 * shape locally rather than weakening the public type contract.
 */
type DedupableAnnotation = {
  id?: unknown;
  eventType?: string;
};

export function dedupAnnotations<T extends DedupableAnnotation>(annotations: T[]): T[] {
  let dedup: Array<T | undefined> = [];

  // Split events by annotationId property existence
  const events = partition(annotations, 'id');

  const eventsById = groupBy(events[0], 'id');
  dedup = map(eventsById, (eventGroup) => {
    if (eventGroup.length > 1 && !every(eventGroup, isPanelAlert)) {
      // Get first non-panel alert
      return find(eventGroup, (event) => {
        return event.eventType !== 'panel-alert';
      });
    } else {
      return head(eventGroup);
    }
  });

  dedup = concat(dedup, events[1]);
  return dedup.filter((event): event is T => event !== undefined);
}

function isPanelAlert(event: { eventType?: string }) {
  return event.eventType === 'panel-alert';
}
