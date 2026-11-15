import React from 'react'
import {
  knowledgeFormats, knowledgeSources, type KnowledgeFilter, type KnowledgeFormat, type KnowledgeSource
} from '../../shared/knowledge-library'

export const emptyFileFacets = { sources: [], formats: [], savedOnly: false } satisfies Partial<KnowledgeFilter>

export function countFileFacets(filter: KnowledgeFilter) {
  return Number(Boolean(filter.sources?.length)) + Number(Boolean(filter.formats?.length)) + Number(Boolean(filter.savedOnly))
}

export function FilterMenu({ draft, change, reset, apply, showSavedOnly = true }: {
  draft: KnowledgeFilter
  change: (next: KnowledgeFilter) => void
  reset: () => void
  apply: () => void
  showSavedOnly?: boolean
}) {
  const toggle = <T extends string>(values: T[] = [], value: T) =>
    values.includes(value) ? values.filter(item => item !== value) : [...values, value]
  return <div className="knowledge-popup knowledge-filter-menu" role="group" aria-label="筛选文件">
    <fieldset>
      <legend>来源</legend>
      <label className="knowledge-filter-all"><input type="checkbox" checked={!draft.sources?.length}
        onChange={() => change({ ...draft, sources: [] })} /><span>不限</span></label>
      <div className="knowledge-filter-options" data-columns="2">
        {(Object.keys(knowledgeSources) as KnowledgeSource[]).map(source => <label key={source}>
          <input type="checkbox" checked={draft.sources?.includes(source) ?? false}
            onChange={() => change({ ...draft, sources: toggle(draft.sources, source) })} />
          <span>{knowledgeSources[source]}</span>
        </label>)}
      </div>
    </fieldset>
    <fieldset>
      <legend>文件格式</legend>
      <label className="knowledge-filter-all"><input type="checkbox" checked={!draft.formats?.length}
        onChange={() => change({ ...draft, formats: [] })} /><span>不限</span></label>
      <div className="knowledge-filter-options" data-columns="3">
        {(Object.keys(knowledgeFormats) as KnowledgeFormat[]).map(format => <label key={format}>
          <input type="checkbox" checked={draft.formats?.includes(format) ?? false}
            onChange={() => change({ ...draft, formats: toggle(draft.formats, format) })} />
          <span>{knowledgeFormats[format]}</span>
        </label>)}
      </div>
    </fieldset>
    <footer>
      {showSavedOnly && <label><input type="checkbox" checked={draft.savedOnly ?? false}
        onChange={event => change({ ...draft, savedOnly: event.currentTarget.checked })} /><span>仅看手动收藏</span></label>}
      <button type="button" onClick={reset}>重置</button>
      <button type="button" className="knowledge-primary" onClick={apply}>完成</button>
    </footer>
  </div>
}
