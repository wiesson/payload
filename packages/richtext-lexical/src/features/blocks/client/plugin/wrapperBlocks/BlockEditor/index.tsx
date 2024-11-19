'use client'
import type { LexicalNode } from 'lexical'
import type { BlocksFieldClient, ClientBlock, Data, FormState } from 'payload'

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext.js'
import { $findMatchingParent, mergeRegister } from '@lexical/utils'
import {
  CloseMenuIcon,
  EditIcon,
  formatDrawerSlug,
  useConfig,
  useEditDepth,
  useLocale,
  useTranslation,
} from '@payloadcms/ui'
import {
  $getSelection,
  $isLineBreakNode,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  KEY_ESCAPE_COMMAND,
  SELECTION_CHANGE_COMMAND,
} from 'lexical'
import { getTranslation } from 'packages/translations/src/utilities/getTranslation.js'
import React, { type JSX, useCallback, useEffect, useRef, useState } from 'react'

import type { WrapperBlockFields, WrapperBlockNodeType } from '../../../../WrapperBlockNode.js'
import type { AdditionalWrapperBlocksPluginArgs } from '../index.js'

import { useEditorConfigContext } from '../../../../../../lexical/config/client/EditorConfigProvider.js'
import { getSelectedNode } from '../../../../../../lexical/utils/getSelectedNode.js'
import { setFloatingElemPositionForLinkEditor } from '../../../../../../lexical/utils/setFloatingElemPositionForLinkEditor.js'
import { FieldsDrawer } from '../../../../../../utilities/fieldsDrawer/Drawer.js'
import { useLexicalDrawer } from '../../../../../../utilities/fieldsDrawer/useLexicalDrawer.js'
import {
  INSERT_WRAPPER_BLOCK_COMMAND,
  TOGGLE_WRAPPER_BLOCK_WITH_MODAL_COMMAND,
} from '../../commands.js'

export function BlockEditor({
  $createWrapperBlockNode,
  $isWrapperBlockNode,
  anchorElem,
}: { anchorElem: HTMLElement } & AdditionalWrapperBlocksPluginArgs): React.ReactNode {
  const [editor] = useLexicalComposerContext()
  // TO-DO: There are several states that should not be state, because they
  // are derived from linkNode (linkUrl, linkLabel, stateData, isLink, isAutoLink...)
  const [wrapperBlockNode, setWrapperBlockNode] = useState<null | WrapperBlockNodeType>()

  const editorRef = useRef<HTMLDivElement | null>(null)
  const [wrapperBlockComponent, setWrapperBlockComponent] = useState<JSX.Element | null>(null)
  const [clientBlock, setClientBlock] = useState<ClientBlock | null>(null)

  const {
    fieldProps: { featureClientSchemaMap, initialLexicalFormState, schemaPath },
    uuid,
  } = useEditorConfigContext()

  const [stateData, setStateData] = useState<({ text: string } & WrapperBlockFields) | undefined>()
  const { i18n, t } = useTranslation<object, string>()

  const editDepth = useEditDepth()
  const [isWrapperBlockNode, setIsWrapperBlockNode] = useState(false)
  const [selectedNodes, setSelectedNodes] = useState<LexicalNode[]>([])

  const drawerSlug = formatDrawerSlug({
    slug: `lexical-rich-text-wrapper-block-` + uuid,
    depth: editDepth,
  })

  const { toggleDrawer } = useLexicalDrawer(drawerSlug)

  const hideBlockPopup = useCallback(() => {
    setIsWrapperBlockNode(false)
    if (editorRef && editorRef.current) {
      editorRef.current.style.opacity = '0'
      editorRef.current.style.transform = 'translate(-10000px, -10000px)'
    }
    setWrapperBlockNode(null)
    setWrapperBlockComponent(null)
    setSelectedNodes([])
    setStateData(undefined)
  }, [])

  const $updateBlockPopup = useCallback(() => {
    const selection = $getSelection()
    let selectedNodeDomRect: DOMRect | undefined

    if (!$isRangeSelection(selection) || !selection) {
      void hideBlockPopup()
      return
    }

    // Handle the data displayed in the floating link editor & drawer when you click on a link node
    const focusNode = getSelectedNode(selection)
    selectedNodeDomRect = editor.getElementByKey(focusNode.getKey())?.getBoundingClientRect()
    const focusWrapperBlockParent = $findMatchingParent(focusNode, $isWrapperBlockNode)

    // Prevent link modal from showing if selection spans further than the link: https://github.com/facebook/lexical/issues/4064
    const badNode = selection
      .getNodes()
      .filter((node) => !$isLineBreakNode(node))
      .find((node) => {
        const wrapperBlockNode = $findMatchingParent(node, $isWrapperBlockNode)
        return (
          (focusWrapperBlockParent && !focusWrapperBlockParent.is(wrapperBlockNode)) ||
          (wrapperBlockNode && !wrapperBlockNode.is(focusWrapperBlockParent))
        )
      })

    if (focusWrapperBlockParent == null || badNode) {
      hideBlockPopup()
      return
    }
    setWrapperBlockNode(focusWrapperBlockParent)

    const fields = focusWrapperBlockParent.getFields()

    // Initial state:
    const data: { text: string } & WrapperBlockFields = {
      ...fields,
      text: focusWrapperBlockParent.getTextContent(),
    }

    setStateData(data)
    setIsWrapperBlockNode(true)
    setSelectedNodes(selection ? selection?.getNodes() : [])

    const componentMapRenderedBlockPath = `${schemaPath}.lexical_internal_feature.blocks.lexical_wrapper_blocks.${data.blockType}`

    const clientSchemaMap = featureClientSchemaMap['blocks']

    const blocksField: BlocksFieldClient = clientSchemaMap[
      componentMapRenderedBlockPath
    ][0] as BlocksFieldClient

    const clientBlock = blocksField.blocks[0]
    setClientBlock(clientBlock)

    const editorElem = editorRef.current
    const nativeSelection = window.getSelection()
    const { activeElement } = document

    if (editorElem === null) {
      return
    }

    const rootElement = editor.getRootElement()

    if (
      nativeSelection !== null &&
      rootElement !== null &&
      rootElement.contains(nativeSelection.anchorNode)
    ) {
      if (!selectedNodeDomRect) {
        // Get the DOM rect of the selected node using the native selection. This sometimes produces the wrong
        // result, which is why we use lexical's selection preferably.
        selectedNodeDomRect = nativeSelection.getRangeAt(0).getBoundingClientRect()
      }

      if (selectedNodeDomRect != null) {
        selectedNodeDomRect.y += 40
        setFloatingElemPositionForLinkEditor(selectedNodeDomRect, editorElem, anchorElem)
      }
    } else if (activeElement == null || activeElement.className !== 'wraper-block-input') {
      hideBlockPopup()
    }

    return true
  }, [editor, $isWrapperBlockNode, schemaPath, featureClientSchemaMap, hideBlockPopup, anchorElem])

  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        TOGGLE_WRAPPER_BLOCK_WITH_MODAL_COMMAND,
        (payload) => {
          if (!payload) {
            return false
          }
          editor.dispatchCommand(INSERT_WRAPPER_BLOCK_COMMAND, payload.fields)

          // Now, open the modal
          $updateBlockPopup()
          toggleDrawer()

          return true
        },
        COMMAND_PRIORITY_LOW,
      ),
    )
  }, [editor, $updateBlockPopup, toggleDrawer, drawerSlug])

  useEffect(() => {
    const scrollerElem = anchorElem.parentElement

    const update = (): void => {
      editor.getEditorState().read(() => {
        void $updateBlockPopup()
      })
    }

    window.addEventListener('resize', update)

    if (scrollerElem != null) {
      scrollerElem.addEventListener('scroll', update)
    }

    return () => {
      window.removeEventListener('resize', update)

      if (scrollerElem != null) {
        scrollerElem.removeEventListener('scroll', update)
      }
    }
  }, [anchorElem.parentElement, editor, $updateBlockPopup])

  useEffect(() => {
    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          void $updateBlockPopup()
        })
      }),

      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          void $updateBlockPopup()
          return true
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        () => {
          if (isWrapperBlockNode) {
            hideBlockPopup()

            return true
          }
          return false
        },
        COMMAND_PRIORITY_HIGH,
      ),
    )
  }, [editor, $updateBlockPopup, isWrapperBlockNode, hideBlockPopup])

  useEffect(() => {
    editor.getEditorState().read(() => {
      void $updateBlockPopup()
    })
  }, [editor, $updateBlockPopup])

  /**
   * Handle drawer and form state
   */

  const blockDisplayName = clientBlock?.labels?.singular
    ? getTranslation(clientBlock.labels.singular, i18n)
    : clientBlock?.slug

  return (
    <React.Fragment>
      <div className="wrapper-block-editor" ref={editorRef}>
        <div className="wraper-block-input">
          {wrapperBlockComponent ? wrapperBlockComponent : blockDisplayName}
          {editor.isEditable() && (
            <React.Fragment>
              <button
                aria-label="Edit Wrapper Block"
                className="wrapper-block-edit"
                onClick={() => {
                  toggleDrawer()
                }}
                onMouseDown={(event) => {
                  event.preventDefault()
                }}
                tabIndex={0}
                type="button"
              >
                <EditIcon />
              </button>
              <button
                aria-label="Remove Wrapper Block"
                className="wrapper-block-trash"
                onClick={() => {
                  editor.dispatchCommand(INSERT_WRAPPER_BLOCK_COMMAND, null)
                }}
                onMouseDown={(event) => {
                  event.preventDefault()
                }}
                tabIndex={0}
                type="button"
              >
                <CloseMenuIcon />
              </button>
            </React.Fragment>
          )}
        </div>
      </div>
      <FieldsDrawer
        className="lexical-wrapper-block-edit-drawer"
        data={stateData}
        drawerSlug={drawerSlug}
        drawerTitle={t(`lexical:blocks:inlineBlocks:${stateData?.id ? 'edit' : 'create'}`, {
          label: blockDisplayName ?? t('lexical:blocks:wrapperBlocks:label'),
        })}
        featureKey="blocks"
        handleDrawerSubmit={(fields: FormState, data: Data) => {
          const newWrapperBlockPayload = data as { text: string } & WrapperBlockFields

          const bareWrapperBlockFields: WrapperBlockFields = {
            ...newWrapperBlockPayload,
          }
          delete bareWrapperBlockFields.text

          // Needs to happen AFTER a potential auto link => link node conversion, as otherwise, the updated text to display may be lost due to
          // it being applied to the auto link node instead of the link node.
          editor.dispatchCommand(INSERT_WRAPPER_BLOCK_COMMAND, {
            fields: bareWrapperBlockFields,
            selectedNodes,
            text: newWrapperBlockPayload.text,
          })
        }}
        schemaPath={schemaPath}
        schemaPathSuffix="fields"
      />
    </React.Fragment>
  )
}