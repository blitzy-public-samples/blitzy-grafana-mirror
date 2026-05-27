import { css } from '@emotion/css';
import type { JSX } from 'react';

import { type GrafanaTheme2, type SelectableValue } from '@grafana/data';
import { AccessoryButton } from '@grafana/plugin-ui';
import { useStyles2 } from '@grafana/ui';

import { type InfluxQueryTag } from '../../../../../types';
import { adjustOperatorIfNeeded, getCondition, getOperator } from '../utils/tagUtils';
import { toSelectableValue } from '../utils/toSelectableValue';

import { AddButton } from './AddButton';
import { Seg } from './Seg';

type KnownOperator = '=' | '!=' | '<>' | '<' | '>' | '>=' | '<=' | '=~' | '!~' | 'Is' | 'Is Not';
const knownOperators: KnownOperator[] = ['=', '!=', '<>', '<', '>', '>=', '<=', '=~', '!~', 'Is', 'Is Not'];

type KnownCondition = 'AND' | 'OR';
const knownConditions: KnownCondition[] = ['AND', 'OR'];

const operatorOptions: Array<SelectableValue<KnownOperator>> = knownOperators.map(toSelectableValue);
const condititonOptions: Array<SelectableValue<KnownCondition>> = knownConditions.map(toSelectableValue);

type Props = {
  tags: InfluxQueryTag[];
  onChange: (tags: InfluxQueryTag[]) => void;
  getTagKeyOptions: () => Promise<string[]>;
  getTagValueOptions: (key: string) => Promise<string[]>;
};

type TagProps = {
  tag: InfluxQueryTag;
  isFirst: boolean;
  onRemove: () => void;
  onChange: (tag: InfluxQueryTag) => void;
  getTagKeyOptions: () => Promise<string[]>;
  getTagValueOptions: (key: string) => Promise<string[]>;
};

const loadConditionOptions = () => Promise.resolve(condititonOptions);

const loadOperatorOptions = () => Promise.resolve(operatorOptions);

const Tag = ({ tag, isFirst, onRemove, onChange, getTagKeyOptions, getTagValueOptions }: TagProps): JSX.Element => {
  const styles = useStyles2(getStyles);
  const operator = getOperator(tag);
  const condition = getCondition(tag, isFirst);

  const getTagKeySegmentOptions = () => {
    return getTagKeyOptions()
      .catch((err) => {
        // in this UI element we add a special item to the list of options,
        // that is used to remove the element.
        // this causes a problem: if `getTagKeyOptions` fails with an error,
        // the remove-filter option is never added to the list,
        // and the UI element can not be removed.
        // to avoid it, we catch any potential errors coming from `getTagKeyOptions`,
        // log the error, and pretend that the list of options is an empty list.
        // this way the remove-item option can always be added to the list.
        console.error(err);
        return [];
      })
      .then((tags) => tags.map(toSelectableValue));
  };

  const getTagValueSegmentOptions = () => {
    return getTagValueOptions(tag.key).then((tags) => tags.map(toSelectableValue));
  };

  const isRegexOperator = operator === '=~' || operator === '!~';

  return (
    <div className={styles.tagRow}>
      {condition != null && (
        <Seg
          value={condition}
          loadOptions={loadConditionOptions}
          onChange={(v) => {
            onChange({ ...tag, condition: v.value });
          }}
        />
      )}
      <Seg
        allowCustomValue
        value={tag.key}
        loadOptions={getTagKeySegmentOptions}
        onChange={(v) => {
          const { value } = v;
          if (value === undefined) {
            onRemove();
          } else {
            onChange({ ...tag, key: value ?? '' });
          }
        }}
      />
      <Seg
        value={operator}
        loadOptions={loadOperatorOptions}
        onChange={(op) => {
          onChange({ ...tag, operator: op.value });
        }}
      />
      <Seg
        allowCustomValue
        value={tag.value}
        loadOptions={isRegexOperator ? undefined : getTagValueSegmentOptions}
        onChange={(v) => {
          const value = v.value ?? '';
          onChange({ ...tag, value, operator: adjustOperatorIfNeeded(operator, value) });
        }}
      />
      <AccessoryButton
        className={styles.removeTag}
        aria-label="remove"
        icon="times"
        variant="secondary"
        onClick={() => {
          onRemove();
        }}
      />
    </div>
  );
};

export const TagsSection = ({ tags, onChange, getTagKeyOptions, getTagValueOptions }: Props): JSX.Element => {
  const onTagChange = (newTag: InfluxQueryTag, index: number) => {
    const newTags = tags.map((tag, i) => {
      return index === i ? newTag : tag;
    });
    onChange(newTags);
  };

  const onTagRemove = (index: number) => {
    const newTags = tags.filter((t, i) => i !== index);
    onChange(newTags);
  };

  const getTagKeySegmentOptions = () => {
    return getTagKeyOptions().then((tags) => tags.map(toSelectableValue));
  };

  const addNewTag = (tagKey: string, isFirst: boolean) => {
    const minimalTag: InfluxQueryTag = {
      key: tagKey,
      value: 'select tag value',
    };

    const newTag: InfluxQueryTag = {
      key: minimalTag.key,
      value: minimalTag.value,
      operator: getOperator(minimalTag),
      condition: getCondition(minimalTag, isFirst),
    };

    onChange([...tags, newTag]);
  };

  return (
    <>
      {tags.map((t, i) => (
        <Tag
          tag={t}
          isFirst={i === 0}
          key={i}
          onChange={(newT) => {
            onTagChange(newT, i);
          }}
          onRemove={() => {
            onTagRemove(i);
          }}
          getTagKeyOptions={getTagKeyOptions}
          getTagValueOptions={getTagValueOptions}
        />
      ))}
      <AddButton
        allowCustomValue
        loadOptions={getTagKeySegmentOptions}
        onAdd={(v) => {
          addNewTag(v, tags.length === 0);
        }}
      />
    </>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  // Replicates the base `.gf-form` rule from
  // packages/grafana-ui/src/themes/GlobalStyles/forms.ts (without modifiers).
  tagRow: css({
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'flex-start',
    textAlign: 'left',
    position: 'relative',
    marginBottom: theme.spacing(0.5),
  }),
  removeTag: css({
    marginRight: theme.spacing(0.5),
  }),
});
