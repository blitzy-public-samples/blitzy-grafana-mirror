import { type ComponentType } from 'react';

import {
  type DashboardVariableModel,
  LoadingState,
  type OrgVariableModel,
  type UserVariableModel,
  VariableHide,
} from '@grafana/data';

import { type VariableAdapter } from '../adapters';
import { type VariableEditorProps } from '../editor/types';
import { type VariablePickerProps } from '../pickers/types';
import { type VariablesState } from '../state/types';
import { initialVariableModelState } from '../types';

type SystemVariableModel = DashboardVariableModel | OrgVariableModel | UserVariableModel;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the system variable value shape (DashboardProps | OrgProps | UserProps) is selected at runtime by the system variable resolver per variable name (__dashboard, __org, __user); this initial-state stub only needs to satisfy the structural toString() contract on the SystemVariable<TProps> generic, and discriminated-union narrowing here would require widening the public SystemVariable type in @grafana/data, which is out of scope.
const initialSystemValue: any = { toString: () => '' };

export const createSystemVariableAdapter = (): VariableAdapter<SystemVariableModel> => {
  return {
    id: 'system',
    description: '',
    name: 'system',
    initialState: {
      ...initialVariableModelState,
      type: 'system',
      hide: VariableHide.hideVariable,
      skipUrlSync: true,
      current: { value: initialSystemValue },
      state: LoadingState.Done,
    },
    reducer: (state: VariablesState = {}) => state,
    picker: null as unknown as ComponentType<VariablePickerProps<SystemVariableModel>>,
    editor: null as unknown as ComponentType<VariableEditorProps<SystemVariableModel>>,
    dependsOn: () => {
      return false;
    },
    setValue: async (variable, option, emitChanges = false) => {
      return;
    },
    setValueFromUrl: async (variable, urlValue) => {
      return;
    },
    updateOptions: async (variable) => {
      return;
    },
    getSaveModel: (variable) => {
      return {};
    },
    getValueForUrl: (variable) => {
      return '';
    },
  };
};
