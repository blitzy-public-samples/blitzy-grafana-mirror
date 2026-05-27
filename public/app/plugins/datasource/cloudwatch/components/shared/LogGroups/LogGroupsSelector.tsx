import { useCallback, useEffect, useMemo, useState } from 'react';

import { type SelectableValue } from '@grafana/data';
import { EditorField } from '@grafana/plugin-ui';
import {
  Button,
  Checkbox,
  Icon,
  InteractiveTable,
  Label,
  LoadingPlaceholder,
  Modal,
  Select,
  Space,
  TextLink,
  useStyles2,
  type Column,
} from '@grafana/ui';

import { type LogGroup } from '../../../dataquery.gen';
import { type DescribeLogGroupsRequest, type ResourceResponse, type LogGroupResponse } from '../../../resources/types';
import getStyles from '../../styles';
import { Account, ALL_ACCOUNTS_OPTION } from '../Account';

import Search from './Search';

type LogGroupRow = LogGroup & { accountLabel?: string };

type CrossAccountLogsQueryProps = {
  selectedLogGroups?: LogGroup[];
  accountOptions?: Array<SelectableValue<string>>;
  fetchLogGroups: (params: Partial<DescribeLogGroupsRequest>) => Promise<Array<ResourceResponse<LogGroupResponse>>>;
  variables?: string[];
  onChange: (selectedLogGroups: LogGroup[]) => void;
  onBeforeOpen?: () => void;
};

export const LogGroupsSelector = ({
  accountOptions = [],
  variables = [],
  fetchLogGroups,
  onChange,
  onBeforeOpen,
  ...props
}: CrossAccountLogsQueryProps) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectableLogGroups, setSelectableLogGroups] = useState<LogGroupRow[]>([]);
  const [selectedLogGroups, setSelectedLogGroups] = useState(props.selectedLogGroups ?? []);
  const [searchPhrase, setSearchPhrase] = useState('');
  const [searchAccountId, setSearchAccountId] = useState(ALL_ACCOUNTS_OPTION.value);
  const [isLoading, setIsLoading] = useState(false);
  const styles = useStyles2(getStyles);
  const selectedLogGroupsCounter = useMemo(
    () => selectedLogGroups.filter((lg) => !lg.name?.startsWith('$')).length,
    [selectedLogGroups]
  );
  const variableOptions = useMemo(() => variables.map((v) => ({ label: v, value: v })), [variables]);
  const selectedVariable = useMemo(
    () => selectedLogGroups.find((lg) => lg.name?.startsWith('$'))?.name,
    [selectedLogGroups]
  );
  const currentVariableOption = {
    label: selectedVariable,
    value: selectedVariable,
  };

  useEffect(() => {
    setSelectedLogGroups(props.selectedLogGroups ?? []);
  }, [props.selectedLogGroups]);

  const toggleModal = () => {
    setIsModalOpen(!isModalOpen);
    if (isModalOpen) {
    } else {
      setSelectedLogGroups(selectedLogGroups);
      searchFn(searchPhrase, searchAccountId);
    }
  };

  const accountNameById = useMemo(() => {
    const idsToNames: Record<string, string> = {};
    accountOptions.forEach((a) => {
      if (a.value && a.label) {
        idsToNames[a.value] = a.label;
      }
    });
    return idsToNames;
  }, [accountOptions]);

  const searchFn = async (searchTerm?: string, accountId?: string) => {
    setIsLoading(true);
    try {
      const possibleLogGroups = await fetchLogGroups({
        logGroupPattern: searchTerm,
        accountId: accountId,
      });
      setSelectableLogGroups(
        possibleLogGroups.map((lg) => ({
          arn: lg.value.arn,
          name: lg.value.name,
          accountId: lg.accountId,
          accountLabel: lg.accountId ? accountNameById[lg.accountId] : undefined,
        }))
      );
    } catch (err) {
      setSelectableLogGroups([]);
    }
    setIsLoading(false);
  };

  const handleSelectCheckbox = useCallback(
    (row: LogGroup, isChecked: boolean) => {
      if (isChecked) {
        setSelectedLogGroups([...selectedLogGroups, row]);
      } else {
        setSelectedLogGroups(selectedLogGroups.filter((lg) => lg.arn !== row.arn));
      }
    },
    [selectedLogGroups]
  );

  const columns = useMemo<Array<Column<LogGroupRow>>>(
    () => [
      {
        id: 'logGroup',
        header: 'Log Group',
        cell: ({ row: { original } }) => (
          <div className={styles.nestedEntry}>
            <Checkbox
              id={original.arn}
              onChange={(ev) => handleSelectCheckbox(original, ev.currentTarget.checked)}
              value={!!(original.arn && selectedLogGroups.some((lg) => lg.arn === original.arn))}
            />
            <Space layout="inline" h={2} />
            <label className={styles.logGroupSearchResults} htmlFor={original.arn} title={original.name}>
              {original.name}
            </label>
          </div>
        ),
      },
      {
        id: 'accountLabel',
        header: 'Account label',
        cell: ({ row: { original } }) => <>{original.accountLabel ?? ''}</>,
        visible: () => accountOptions.length > 0,
      },
      {
        id: 'accountId',
        header: 'Account ID',
        cell: ({ row: { original } }) => <>{original.accountId ?? ''}</>,
      },
    ],
    [accountOptions.length, selectedLogGroups, styles, handleSelectCheckbox]
  );

  const getRowId = useCallback((row: LogGroupRow) => row.arn ?? row.name ?? '', []);

  const handleApply = () => {
    onChange(selectedLogGroups);
    toggleModal();
  };

  const handleCancel = () => {
    setSelectedLogGroups(selectedLogGroups);
    toggleModal();
  };

  return (
    <>
      <Modal className={styles.modal} title="Select log groups" isOpen={isModalOpen} onDismiss={toggleModal}>
        <div className={styles.logGroupSelectionArea}>
          <div className={styles.searchField}>
            <EditorField label="Log group name prefix">
              <Search
                searchFn={(phrase) => {
                  searchFn(phrase, searchAccountId);
                  setSearchPhrase(phrase);
                }}
                searchPhrase={searchPhrase}
              />
            </EditorField>
          </div>

          <Account
            onChange={(accountId?: string) => {
              searchFn(searchPhrase, accountId);
              setSearchAccountId(accountId || ALL_ACCOUNTS_OPTION.value);
            }}
            accountOptions={accountOptions}
            accountId={searchAccountId}
          />
        </div>
        <Space layout="block" v={2} />
        <div>
          {!isLoading && selectableLogGroups.length >= 25 && (
            <>
              <div className={styles.limitLabel}>
                <Icon name="info-circle"></Icon>
                Only the first 50 results can be shown. If you do not see an expected log group, try narrowing down your
                search.
                <p>
                  A{' '}
                  <TextLink
                    external
                    href="https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/cloudwatch_limits_cwl.html"
                  >
                    maximum{' '}
                  </TextLink>{' '}
                  of 50 Cloudwatch log groups can be queried at one time.
                </p>
              </div>
              <Space layout="block" v={1} />
            </>
          )}
          {isLoading && <LoadingPlaceholder text="Loading..." />}
          {!isLoading && selectableLogGroups.length === 0 && <div>No log groups found</div>}
          {!isLoading && selectableLogGroups.length > 0 && (
            <div className={styles.tableScroller}>
              <InteractiveTable columns={columns} data={selectableLogGroups} getRowId={getRowId} />
            </div>
          )}
        </div>
        <Space layout="block" v={2} />
        <Label className={styles.logGroupCountLabel}>
          {selectedLogGroupsCounter} log group{selectedLogGroupsCounter !== 1 && 's'} selected
        </Label>
        <Space layout="block" v={1} />
        <EditorField
          label="Template variable"
          width={26}
          tooltip="Optionally you can specify a single or multi-valued template variable. Select a variable separately or in conjunction with log groups."
        >
          <Select
            isClearable
            aria-label="Template variable"
            value={currentVariableOption}
            allowCustomValue
            options={variableOptions}
            onChange={(option) => {
              const newValues = selectedLogGroups.filter((lg) => !lg.name?.startsWith('$'));
              if (option?.label) {
                newValues.push({ name: option.label, arn: option.label });
              }
              setSelectedLogGroups(newValues);
            }}
          />
        </EditorField>

        <Modal.ButtonRow>
          <Button onClick={handleCancel} variant="secondary" type="button" fill="outline">
            Cancel
          </Button>
          <Button onClick={handleApply} type="button">
            Add log groups
          </Button>
        </Modal.ButtonRow>
      </Modal>

      <div>
        <Button
          variant="secondary"
          onClick={() => {
            try {
              onBeforeOpen?.();
              toggleModal();
            } catch (err) {}
          }}
          type="button"
        >
          Select log groups
        </Button>
      </div>
    </>
  );
};
