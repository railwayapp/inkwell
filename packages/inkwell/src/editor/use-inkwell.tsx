"use client";

import {
  type ComponentType,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import { Node } from "slate";
import type {
  InkwellEditorController,
  InkwellEditorHandle,
  InkwellEditorState,
  UseInkwellOptions,
  UseInkwellResult,
} from "../types";
import { InkwellEditor } from "./inkwell-editor";
import { deserialize } from "./slate/deserialize";

const getInitialState = (options: UseInkwellOptions): InkwellEditorState => {
  const nodes = deserialize(options.content, options.decorations);
  const text = nodes.reduce(
    (value, node) => `${value}${Node.string(node)}`,
    "",
  );
  const characterCount = text.length;
  const overLimit =
    options.characterLimit !== undefined &&
    characterCount > options.characterLimit;

  return {
    markdown: options.content,
    text,
    isEmpty: text.trim().length === 0,
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
      getMarkdown: () => {
        const current = editorRef.current;
        return current ? current.getMarkdown() : stateRef.current.markdown;
      },
      getText: () => {
        const current = editorRef.current;
        return current ? current.getText() : stateRef.current.text;
      },
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
      setMarkdown: (markdown, options) => {
        editorRef.current?.setMarkdown(markdown, options);
      },
      insertMarkdown: markdown => {
        editorRef.current?.insertMarkdown(markdown);
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
