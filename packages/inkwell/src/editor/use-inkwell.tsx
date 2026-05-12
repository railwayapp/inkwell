"use client";

import {
  type ComponentType,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  InkwellEditorController,
  InkwellEditorHandle,
  InkwellEditorState,
  UseInkwellOptions,
  UseInkwellResult,
} from "../types";
import { InkwellEditor } from "./inkwell-editor";

const getInitialState = (options: UseInkwellOptions): InkwellEditorState => {
  const characterCount = options.content.length;
  const overLimit =
    options.characterLimit !== undefined &&
    characterCount > options.characterLimit;

  return {
    content: options.content,
    isEmpty: options.content.trim().length === 0,
    isFocused: false,
    isEditable: options.editable ?? true,
    characterCount,
    characterLimit: options.characterLimit,
    overLimit,
  };
};

export const useInkwell = (options: UseInkwellOptions): UseInkwellResult => {
  const editorRef = useRef<InkwellEditorHandle>(null);
  const optionsRef = useRef(options);
  const [state, setState] = useState(() => getInitialState(options));
  const stateRef = useRef(state);

  optionsRef.current = options;
  stateRef.current = state;

  const handleStateChange = useCallback((nextState: InkwellEditorState) => {
    stateRef.current = nextState;
    setState(nextState);
    optionsRef.current.onStateChange?.(nextState);
  }, []);

  const editor = useMemo<InkwellEditorController>(
    () => ({
      getState: () => {
        const current = editorRef.current;
        return current ? current.getState() : stateRef.current;
      },
      focus: options => {
        editorRef.current?.focus(options);
      },
      clear: options => {
        editorRef.current?.clear(options);
      },
      setContent: (content, options) => {
        editorRef.current?.setContent(content, options);
      },
      insertContent: content => {
        editorRef.current?.insertContent(content);
      },
    }),
    [],
  );

  const EditorInstance = useMemo<ComponentType>(() => {
    const UseInkwellEditor = () => {
      const currentOptions = optionsRef.current;
      return (
        <InkwellEditor
          {...currentOptions}
          ref={editorRef}
          onStateChange={handleStateChange}
        />
      );
    };

    UseInkwellEditor.displayName = "UseInkwellEditor";
    return UseInkwellEditor;
  }, [handleStateChange]);

  return useMemo(
    () => ({
      state,
      editor,
      EditorInstance,
    }),
    [EditorInstance, editor, state],
  );
};
