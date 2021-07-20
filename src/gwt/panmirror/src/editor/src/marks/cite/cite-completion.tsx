/*
 * cite-completion.tsx
 *
 * Copyright (C) 2021 by RStudio, PBC
 *
 * Unless you have received this program directly from RStudio pursuant
 * to the terms of a commercial license agreement with RStudio, then
 * this program is licensed to you under the terms of version 3 of the
 * GNU Affero General Public License. This program is distributed WITHOUT
 * ANY EXPRESS OR IMPLIED WARRANTY, INCLUDING THOSE OF NON-INFRINGEMENT,
 * MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. Please refer to the
 * AGPL (http://www.gnu.org/licenses/agpl-3.0.txt) for more details.
 *
 */

import { EditorState, Transaction } from 'prosemirror-state';
import { Node as ProsemirrorNode, Schema } from 'prosemirror-model';
import { DecorationSet, EditorView } from 'prosemirror-view';

import React from 'react';
import uniqby from 'lodash.uniqby';

import { BibliographyManager } from '../../api/bibliography/bibliography';
import { CompletionHandler, CompletionResult, CompletionHeaderProps } from '../../api/completion';
import { hasDOI } from '../../api/doi';
import { searchPlaceholderDecoration } from '../../api/placeholder';
import { EditorUI } from '../../api/ui';
import { CompletionItemView } from '../../api/widgets/completion';

import { EditorServer } from '../../api/server';
import { EditorEvents } from '../../api/events';

import { parseCitation } from './cite';

import './cite-completion.css';
import { bibliographyCiteCompletionProvider } from './cite-completion-bibliography';
import { EditorFormat, kQuartoDocType } from '../../api/format';
import { quartoXrefCiteCompletionProvider } from './cite-completion-quarto-xref';


const kAuthorMaxChars = 28;
const kMaxCitationCompletions = 100;
const kHeaderHeight = 20;

export const kCiteCompletionWidth = 400;
const kCiteCompletionItemPadding = 10;

export const kCitationCompleteScope = 'CitationScope';

// An entry which includes the source as well
// additional metadata for displaying a bibliograph item
export interface CiteCompletionEntry {
  id: string;
  type: string;
  primaryText: string;
  secondaryText: (len: number) => string;
  detailText: string;
  image?: string;
  imageAdornment?: string;
  replace: (view: EditorView, pos: number, server: EditorServer) => Promise<void>;
}

export interface CiteCompletionProvider {
  exactMatch: (searchTerm: string) => boolean;
  search: (searchTerm: string, maxCompletions: number) => CiteCompletionEntry[];
  currentEntries: () => CiteCompletionEntry[] | undefined;
  streamEntries: (doc: ProsemirrorNode, onStreamReady: (entries: CiteCompletionEntry[]) => void) => void;
  awaitEntries: (doc: ProsemirrorNode) => Promise<CiteCompletionEntry[]>;
  warningMessage(): string | undefined;
}

export function citationCompletionHandler(
  ui: EditorUI,
  _events: EditorEvents,
  bibManager: BibliographyManager,
  server: EditorServer,
  format: EditorFormat
): CompletionHandler<CiteCompletionEntry> {

  const completionProviders = [bibliographyCiteCompletionProvider(ui, bibManager)];
  if (format.docTypes.includes(kQuartoDocType)) {
    completionProviders.push(quartoXrefCiteCompletionProvider(ui, server));
  }

  return {
    id: 'AB9D4F8C-DA00-403A-AB4A-05373906FD8C',

    scope: kCitationCompleteScope,

    completions: citationCompletions(ui, completionProviders),

    filter: (entries: CiteCompletionEntry[], state: EditorState, token: string) => {
      return filterCitations(token, completionProviders, entries, ui, state.doc);
    },

    replace(view: EditorView, pos: number, entry: CiteCompletionEntry | null) {
      // If there is an entry selected, insert it into the document
      if (entry) {
        entry.replace(view, pos, server);
      }
      return Promise.resolve();
    },

    replacement(_schema: Schema, entry: CiteCompletionEntry | null): string | ProsemirrorNode | null {
      if (entry) {
        return entry.id;
      } else {
        return null;
      }
    },

    view: {
      header: () => {
        const warningProvider = completionProviders.find(provider => provider.warningMessage() !== undefined);
        if (warningProvider) {
          return {
            component: CompletionWarningHeaderView,
            height: kHeaderHeight,
            message: warningProvider.warningMessage(),
          };
        }
      },
      component: CiteCompletionItemView,
      key: entry => entry.id,
      width: kCiteCompletionWidth,
      height: 54,
      maxVisible: 5,
      hideNoResults: true,
    },
  };
}

function filterCitations(token: string, completionProviders: CiteCompletionProvider[], entries: CiteCompletionEntry[], ui: EditorUI, doc: ProsemirrorNode) {
  // Empty query or DOI
  if (token.trim().length === 0 || hasDOI(token)) {
    return entries;
  }
  // Filter an exact match - if its exact match to an entry in the bibliography already, skip completion
  // Ignore any punctuation at the end of the token
  const tokenWithoutEndPunctuation = token.match(/.*[^\,\!\?\.\:]/);
  const completionId = tokenWithoutEndPunctuation ? tokenWithoutEndPunctuation[0] : token;
  if (completionProviders.some(provider => provider.exactMatch(completionId))) {
    return [];
  }

  // Perform a search
  const searchResults: CiteCompletionEntry[] = [];
  completionProviders.forEach(provider => {
    const results = provider.search(token, kMaxCitationCompletions);
    if (results) {
      searchResults.push(...results);
    }
  });
  return dedupe(searchResults || []);
}

function dedupe(entries: CiteCompletionEntry[]): CiteCompletionEntry[] {
  return uniqby(entries, (entry: CiteCompletionEntry) => `${entry.id}${entry.type}`);;
}

function sortEntries(entries: CiteCompletionEntry[]): CiteCompletionEntry[] {
  const dedupedSources = dedupe(entries);
  return dedupedSources.sort((a, b) => a.id.localeCompare(b.id));
}

function citationCompletions(ui: EditorUI, completionProviders: CiteCompletionProvider[]) {
  return (_text: string, context: EditorState | Transaction): CompletionResult<CiteCompletionEntry> | null => {


    const parsed = parseCitation(context);
    if (parsed) {
      return {
        token: parsed.token,
        pos: parsed.pos,
        offset: parsed.offset,
        completions: async (_state: EditorState) => {

          // otherwise, do search and provide results when ready     
          let currentEntries: CiteCompletionEntry[] | undefined;
          completionProviders.map(provider => {
            const entries = provider.currentEntries();
            if (entries) {
              currentEntries = currentEntries || [];
              currentEntries.push(...entries);
            }
          });

          if (currentEntries) {
            // kick off another load which we'll stream in by setting entries
            let loadedEntries: CiteCompletionEntry[] | null = null;
            completionProviders.forEach(provider => {
              provider.streamEntries(context.doc, (entries: CiteCompletionEntry[]) => {
                loadedEntries = sortEntries(entries);
              });
            });

            // return stream
            return {
              items: sortEntries(currentEntries),
              stream: () => loadedEntries,
            };

          } else {
            const promises = completionProviders.map(provider => provider.awaitEntries(context.doc));
            return Promise.all(promises).then(values => {
              const results: CiteCompletionEntry[] = [];
              values.forEach(value => results.push(...value));
              return sortEntries(results);
            });
          }
        },
        decorations:
          parsed.token.length === 0
            ? DecorationSet.create(context.doc, [
              searchPlaceholderDecoration(context.selection.head, ui, ui.context.translateText('or DOI')),
            ])
            : undefined,
      };
    }
    return null;
  };
}

// The title may contain spans to control case specifically - consequently, we need
// to render the title as HTML rather than as a string
export const CiteCompletionItemView: React.FC<CiteCompletionEntry> = entry => {
  return (
    <CompletionItemView
      width={kCiteCompletionWidth - kCiteCompletionItemPadding}
      image={entry.image}
      imageAdornment={entry.imageAdornment}
      title={`@${entry.primaryText}`}
      detail={entry.secondaryText(kAuthorMaxChars - entry.primaryText.length)}
      subTitle={entry.detailText}
      htmlTitle={true}
    />
  );
};

const CompletionWarningHeaderView: React.FC<CompletionHeaderProps> = props => {
  return (
    <div className={'pm-completion-cite-warning pm-pane-border-color'}>
      {props.ui.context.translateText(props.message || 'An unexpected warning occurred.')}
    </div>
  );
};
