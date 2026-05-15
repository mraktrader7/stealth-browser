/**
 * ScriptPlayground.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Visual, drag-and-drop style automation workflow builder.
 *
 * Design decisions:
 *  - Each "step" = one browser action (goto, click, fill, wait, scroll, etc.)
 *  - Steps are shown as a vertical card list; user can reorder via ↑/↓ arrows
 *  - Each step has:
 *      • Action type selector  (what to do)
 *      • Target selector input (which element – supports CSS, XPath, text=, id=)
 *      • Value input           (what to type / URL to visit / ms to wait)
 *      • Comment input         (human note – shown as a code comment in output)
 *  - Selector method choice: CSS | XPath | Text | Data-testid | ID
 *  - "Generate Code" converts the step list into valid Playwright JS
 *  - Generated code is inserted into the Monaco editor (parent)
 *
 * Selector methods supported:
 *  ┌──────────────┬──────────────────────────────────────────────────────────┐
 *  │ CSS          │ .class, #id, input[name="x"], button.primary            │
 *  │ XPath        │ //button[contains(text(),'Login')]                      │
 *  │ Text         │ text=Sign In  (Playwright built-in)                     │
 *  │ Data-testid  │ [data-testid="..."]  (React/Next apps)                  │
 *  │ ID           │ #my-id  (shorthand)                                     │
 *  │ Placeholder  │ [placeholder="..."]                                     │
 *  │ Role         │ getByRole('button', {name:'Submit'})  (ARIA)            │
 *  └──────────────┴──────────────────────────────────────────────────────────┘
 */

import React, { useState, useCallback, useId } from 'react'
import {
  Plus, Trash2, ChevronUp, ChevronDown, Code2, Play, Copy,
  MousePointer2, Keyboard, Globe, Clock, ScrollText, ArrowRight,
  CheckSquare, ToggleLeft, Camera, AlertCircle, GripVertical,
  ChevronDown as Chevron, MessageSquare, Wand2
} from 'lucide-react'

// ─── Action Definitions ───────────────────────────────────────────────────────
const ACTIONS = [
  // Navigation
  { group: 'Navigation', value: 'goto',           label: 'Go to URL',          icon: Globe,         needsSelector: false, needsValue: true,  valuePlaceholder: 'https://example.com',     valueLabel: 'URL' },
  { group: 'Navigation', value: 'goBack',          label: 'Go Back',            icon: ArrowRight,    needsSelector: false, needsValue: false },
  { group: 'Navigation', value: 'reload',          label: 'Reload Page',        icon: Globe,         needsSelector: false, needsValue: false },
  { group: 'Navigation', value: 'waitForURL',      label: 'Wait for URL',       icon: Globe,         needsSelector: false, needsValue: true,  valuePlaceholder: '**/dashboard**',          valueLabel: 'URL pattern' },

  // Mouse
  { group: 'Mouse',      value: 'click',           label: 'Click Element',      icon: MousePointer2, needsSelector: true,  needsValue: false },
  { group: 'Mouse',      value: 'dblclick',        label: 'Double Click',       icon: MousePointer2, needsSelector: true,  needsValue: false },
  { group: 'Mouse',      value: 'hover',           label: 'Hover Element',      icon: MousePointer2, needsSelector: true,  needsValue: false },
  { group: 'Mouse',      value: 'scroll',          label: 'Scroll To Element',  icon: ScrollText,    needsSelector: true,  needsValue: false },
  { group: 'Mouse',      value: 'scrollPage',      label: 'Scroll Page',        icon: ScrollText,    needsSelector: false, needsValue: true,  valuePlaceholder: 'down | up | 500 (px)',    valueLabel: 'Direction / px' },

  // Keyboard / Input
  { group: 'Input',      value: 'fill',            label: 'Type into Input',    icon: Keyboard,      needsSelector: true,  needsValue: true,  valuePlaceholder: 'Text to type…',           valueLabel: 'Value' },
  { group: 'Input',      value: 'press',           label: 'Press Key',          icon: Keyboard,      needsSelector: true,  needsValue: true,  valuePlaceholder: 'Enter | Tab | Escape',     valueLabel: 'Key' },
  { group: 'Input',      value: 'selectOption',    label: 'Select Dropdown',    icon: ToggleLeft,    needsSelector: true,  needsValue: true,  valuePlaceholder: 'option value or label',   valueLabel: 'Option' },
  { group: 'Input',      value: 'check',           label: 'Check Checkbox',     icon: CheckSquare,   needsSelector: true,  needsValue: false },
  { group: 'Input',      value: 'uncheck',         label: 'Uncheck Checkbox',   icon: CheckSquare,   needsSelector: true,  needsValue: false },
  { group: 'Input',      value: 'clearInput',      label: 'Clear Input',        icon: Keyboard,      needsSelector: true,  needsValue: false },
  { group: 'Input',      value: 'uploadFile',      label: 'Upload File',        icon: ArrowRight,    needsSelector: true,  needsValue: true,  valuePlaceholder: '/path/to/file.pdf',        valueLabel: 'File path' },

  // Waiting
  { group: 'Wait',       value: 'waitForSelector', label: 'Wait for Element',   icon: Clock,         needsSelector: true,  needsValue: false },
  { group: 'Wait',       value: 'waitForHidden',   label: 'Wait Until Hidden',  icon: Clock,         needsSelector: true,  needsValue: false },
  { group: 'Wait',       value: 'sleep',           label: 'Sleep (ms)',         icon: Clock,         needsSelector: false, needsValue: true,  valuePlaceholder: '1000',                    valueLabel: 'Milliseconds' },
  { group: 'Wait',       value: 'waitForNetIdle',  label: 'Wait Network Idle',  icon: Clock,         needsSelector: false, needsValue: false },

  // Data
  { group: 'Data',       value: 'getText',         label: 'Read Text',          icon: Code2,         needsSelector: true,  needsValue: true,  valuePlaceholder: 'varName (log output)',     valueLabel: 'Variable name' },
  { group: 'Data',       value: 'getAttribute',    label: 'Get Attribute',      icon: Code2,         needsSelector: true,  needsValue: true,  valuePlaceholder: 'href | src | value',      valueLabel: 'Attribute' },
  { group: 'Data',       value: 'screenshot',      label: 'Take Screenshot',    icon: Camera,        needsSelector: false, needsValue: true,  valuePlaceholder: '/tmp/screenshot.png',     valueLabel: 'File path' },
  { group: 'Data',       value: 'log',             label: 'Log Message',        icon: MessageSquare, needsSelector: false, needsValue: true,  valuePlaceholder: 'Message to log…',         valueLabel: 'Message' },
]

const ACTION_MAP = Object.fromEntries(ACTIONS.map((a) => [a.value, a]))

const ACTION_GROUPS = ACTIONS.reduce((acc, a) => {
  if (!acc[a.group]) acc[a.group] = []
  acc[a.group].push(a)
  return acc
}, {})

// ─── Selector Methods ─────────────────────────────────────────────────────────
const SELECTOR_METHODS = [
  { value: 'css',         label: 'CSS',          hint: '.class, #id, button[type="submit"]',   build: (v) => v },
  { value: 'id',          label: 'ID',           hint: 'login-btn  →  #login-btn',             build: (v) => `#${v.replace(/^#/, '')}` },
  { value: 'text',        label: 'Text Content', hint: 'Sign In',                              build: (v) => `text=${v}` },
  { value: 'testid',      label: 'data-testid',  hint: 'login-button',                         build: (v) => `[data-testid="${v}"]` },
  { value: 'placeholder', label: 'Placeholder',  hint: 'Enter your email',                     build: (v) => `[placeholder="${v}"]` },
  { value: 'xpath',       label: 'XPath',        hint: '//button[contains(text(),"Login")]',   build: (v) => `xpath=${v}` },
  { value: 'role',        label: 'ARIA Role',    hint: 'button:Submit  (role:name)',            build: (v) => {
    const [role, name] = v.split(':')
    return name ? `role=${role.trim()}[name="${name.trim()}"]` : `role=${v}`
  }},
]

const SELECTOR_MAP = Object.fromEntries(SELECTOR_METHODS.map((m) => [m.value, m]))

// ─── Code Generator ───────────────────────────────────────────────────────────
function generateCode(steps) {
  if (steps.length === 0) return '// No steps added yet.\n// Use the Playground tab to build your automation visually.'

  const lines = [
    '// ═══════════════════════════════════════════════════════════════════════════',
    '// Auto-generated by ScriptPlayground — feel free to edit!',
    '// ═══════════════════════════════════════════════════════════════════════════',
    '',
  ]

  steps.forEach((step, i) => {
    const def = ACTION_MAP[step.action]
    if (!def) return

    // Add comment above the step
    const comment = step.comment?.trim()
    if (comment) {
      lines.push(`// Step ${i + 1}: ${comment}`)
    } else {
      lines.push(`// Step ${i + 1}: ${def.label}`)
    }

    // Build selector string
    const selectorMethod = SELECTOR_MAP[step.selectorMethod || 'css']
    const rawSelector = step.selector?.trim() || ''
    const selector = rawSelector ? selectorMethod.build(rawSelector) : ''

    switch (step.action) {
      case 'goto':
        lines.push(`await page.goto('${step.value || ''}', { waitUntil: 'domcontentloaded' });`)
        break
      case 'goBack':
        lines.push(`await page.goBack();`)
        break
      case 'reload':
        lines.push(`await page.reload({ waitUntil: 'domcontentloaded' });`)
        break
      case 'waitForURL':
        lines.push(`await page.waitForURL('${step.value || ''}', { timeout: 15000 });`)
        break
      case 'click':
        lines.push(`await page.click('${selector}');`)
        break
      case 'dblclick':
        lines.push(`await page.dblclick('${selector}');`)
        break
      case 'hover':
        lines.push(`await page.hover('${selector}');`)
        break
      case 'scroll':
        lines.push(`await page.locator('${selector}').scrollIntoViewIfNeeded();`)
        break
      case 'scrollPage': {
        const dir = step.value?.trim()
        if (!dir || dir === 'down') lines.push(`await page.evaluate(() => window.scrollBy(0, window.innerHeight));`)
        else if (dir === 'up') lines.push(`await page.evaluate(() => window.scrollBy(0, -window.innerHeight));`)
        else if (/^\d+$/.test(dir)) lines.push(`await page.evaluate(() => window.scrollBy(0, ${dir}));`)
        else lines.push(`await page.evaluate(() => window.scrollBy(0, window.innerHeight)); // direction: ${dir}`)
        break
      }
      case 'fill':
        lines.push(`await page.fill('${selector}', '${(step.value || '').replace(/'/g, "\\'")}');`)
        break
      case 'press':
        lines.push(`await page.press('${selector}', '${step.value || 'Enter'}');`)
        break
      case 'selectOption':
        lines.push(`await page.selectOption('${selector}', '${step.value || ''}');`)
        break
      case 'check':
        lines.push(`await page.check('${selector}');`)
        break
      case 'uncheck':
        lines.push(`await page.uncheck('${selector}');`)
        break
      case 'clearInput':
        lines.push(`await page.fill('${selector}', '');`)
        break
      case 'uploadFile':
        lines.push(`await page.setInputFiles('${selector}', '${step.value || ''}');`)
        break
      case 'waitForSelector':
        lines.push(`await page.waitForSelector('${selector}', { timeout: 10000 });`)
        break
      case 'waitForHidden':
        lines.push(`await page.waitForSelector('${selector}', { state: 'hidden', timeout: 10000 });`)
        break
      case 'sleep':
        lines.push(`await sleep(${parseInt(step.value) || 1000});`)
        break
      case 'waitForNetIdle':
        lines.push(`await page.waitForLoadState('networkidle');`)
        break
      case 'getText': {
        const varName = step.value?.trim() || `text_${i + 1}`
        lines.push(`const ${varName} = await page.textContent('${selector}');`)
        lines.push(`log.info(\`${varName}: \${${varName}}\`);`)
        break
      }
      case 'getAttribute': {
        const attrName = step.value?.trim() || 'href'
        const varName = `attr_${i + 1}`
        lines.push(`const ${varName} = await page.getAttribute('${selector}', '${attrName}');`)
        lines.push(`log.info(\`${attrName}: \${${varName}}\`);`)
        break
      }
      case 'screenshot':
        lines.push(`await page.screenshot({ path: '${step.value || '/tmp/screenshot.png'}', fullPage: true });`)
        lines.push(`log.success('Screenshot saved to ${step.value || '/tmp/screenshot.png'}');`)
        break
      case 'log':
        lines.push(`log.info('${(step.value || '').replace(/'/g, "\\'")}');`)
        break
      default:
        lines.push(`// [unknown action: ${step.action}]`)
    }

    lines.push('') // blank line between steps
  })

  return lines.join('\n')
}

// ─── Step Card ────────────────────────────────────────────────────────────────
function StepCard({ step, index, total, onChange, onDelete, onMoveUp, onMoveDown }) {
  const def = ACTION_MAP[step.action]
  const [expanded, setExpanded] = useState(true)
  const uid = useId()

  const selectorDef = SELECTOR_MAP[step.selectorMethod || 'css']

  return (
    <div className="border border-slate-700 rounded-xl bg-slate-800/60 overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-800">
        {/* Step number */}
        <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-sky-600/20 border border-sky-500/30 text-sky-400 text-xs font-bold">
          {index + 1}
        </span>

        {/* Action selector */}
        <select
          className="flex-1 bg-slate-700 border border-slate-600 text-slate-200 text-sm rounded-lg px-2 py-1 outline-none focus:border-sky-500"
          value={step.action}
          onChange={(e) => onChange({ ...step, action: e.target.value, selector: '', value: '', selectorMethod: 'css' })}
        >
          {Object.entries(ACTION_GROUPS).map(([group, items]) => (
            <optgroup key={group} label={group}>
              {items.map((a) => (
                <option key={a.value} value={a.value}>{a.label}</option>
              ))}
            </optgroup>
          ))}
        </select>

        {/* Controls */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            disabled={index === 0}
            onClick={onMoveUp}
            className="p-1 rounded hover:bg-slate-700 disabled:opacity-30 text-slate-400 hover:text-slate-200"
            title="Move up"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button
            disabled={index === total - 1}
            onClick={onMoveDown}
            className="p-1 rounded hover:bg-slate-700 disabled:opacity-30 text-slate-400 hover:text-slate-200"
            title="Move down"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setExpanded((p) => !p)}
            className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-slate-200"
            title={expanded ? 'Collapse' : 'Expand'}
          >
            <Chevron className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
          <button
            onClick={onDelete}
            className="p-1 rounded hover:bg-red-700/30 text-slate-500 hover:text-red-400"
            title="Delete step"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      {expanded && (
        <div className="px-3 pb-3 pt-2 space-y-2.5">
          {/* Selector row */}
          {def?.needsSelector && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-400 w-20 flex-shrink-0">Target</label>
                {/* Selector method */}
                <select
                  className="bg-slate-700 border border-slate-600 text-slate-300 text-xs rounded-lg px-2 py-1 outline-none focus:border-sky-500 w-32 flex-shrink-0"
                  value={step.selectorMethod || 'css'}
                  onChange={(e) => onChange({ ...step, selectorMethod: e.target.value, selector: '' })}
                >
                  {SELECTOR_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
                {/* Selector value */}
                <input
                  className="flex-1 bg-slate-700 border border-slate-600 text-slate-200 text-sm rounded-lg px-2.5 py-1 outline-none focus:border-sky-500 font-mono"
                  placeholder={selectorDef?.hint || 'Selector…'}
                  value={step.selector || ''}
                  onChange={(e) => onChange({ ...step, selector: e.target.value })}
                />
              </div>
              {/* Preview of built selector */}
              {step.selector?.trim() && (
                <p className="text-xs text-slate-500 pl-24 font-mono truncate">
                  → <span className="text-sky-500">{selectorDef?.build(step.selector.trim())}</span>
                </p>
              )}
            </div>
          )}

          {/* Value row */}
          {def?.needsValue && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-400 w-20 flex-shrink-0">{def.valueLabel || 'Value'}</label>
              <input
                className="flex-1 bg-slate-700 border border-slate-600 text-slate-200 text-sm rounded-lg px-2.5 py-1 outline-none focus:border-sky-500"
                placeholder={def.valuePlaceholder || 'Value…'}
                value={step.value || ''}
                onChange={(e) => onChange({ ...step, value: e.target.value })}
              />
            </div>
          )}

          {/* Comment row */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400 w-20 flex-shrink-0">Comment</label>
            <input
              className="flex-1 bg-slate-700/50 border border-slate-700 text-slate-400 text-xs rounded-lg px-2.5 py-1 outline-none focus:border-slate-500 italic"
              placeholder="Optional note — what does this step do?"
              value={step.comment || ''}
              onChange={(e) => onChange({ ...step, comment: e.target.value })}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Playground Component ────────────────────────────────────────────────
/**
 * @param {object}   props
 * @param {Function} props.onCodeGenerated  - called with generated code string
 */
export default function ScriptPlayground({ onCodeGenerated }) {
  const [steps, setSteps] = useState([])
  const [preview, setPreview] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [copied, setCopied] = useState(false)

  const addStep = useCallback((afterIndex = -1) => {
    const newStep = {
      id: `${Date.now()}-${Math.random()}`,
      action: 'goto',
      selector: '',
      selectorMethod: 'css',
      value: '',
      comment: '',
    }
    setSteps((prev) => {
      const arr = [...prev]
      arr.splice(afterIndex + 1, 0, newStep)
      return arr
    })
  }, [])

  const updateStep = useCallback((id, updated) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...updated, id } : s)))
  }, [])

  const deleteStep = useCallback((id) => {
    setSteps((prev) => prev.filter((s) => s.id !== id))
  }, [])

  const moveStep = useCallback((id, dir) => {
    setSteps((prev) => {
      const idx = prev.findIndex((s) => s.id === id)
      if (idx < 0) return prev
      const arr = [...prev]
      const swap = idx + dir
      if (swap < 0 || swap >= arr.length) return prev;
      [arr[idx], arr[swap]] = [arr[swap], arr[idx]]
      return arr
    })
  }, [])

  const handleGenerate = useCallback(() => {
    const code = generateCode(steps)
    setPreview(code)
    setShowPreview(true)
    if (onCodeGenerated) onCodeGenerated(code)
  }, [steps, onCodeGenerated])

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(preview)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (_) {}
  }, [preview])

  return (
    <div className="flex flex-col h-full">
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/50">
        <div className="flex items-center gap-2">
          <Wand2 className="w-4 h-4 text-violet-400" />
          <span className="text-sm font-semibold text-slate-200">Automation Playground</span>
          <span className="badge bg-slate-700 text-slate-400 text-xs">{steps.length} steps</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => addStep(steps.length - 1)}
            className="btn-secondary text-xs gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" /> Add Step
          </button>
          <button
            onClick={handleGenerate}
            disabled={steps.length === 0}
            className="btn-primary text-xs gap-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40"
          >
            <Code2 className="w-3.5 h-3.5" /> Generate & Insert Code
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Step List ── */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {steps.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-600 py-16">
              <Wand2 className="w-12 h-12 opacity-20" />
              <div className="text-center">
                <p className="text-base font-medium text-slate-500">No steps yet</p>
                <p className="text-sm text-slate-600 mt-1 max-w-xs">
                  Add steps to build your automation visually.<br />
                  Each step = one browser action.
                </p>
              </div>
              <button onClick={() => addStep(-1)} className="btn-primary gap-2">
                <Plus className="w-4 h-4" /> Add First Step
              </button>

              {/* Quick start examples */}
              <div className="mt-4 w-full max-w-sm">
                <p className="text-xs text-slate-600 text-center mb-3">Or start with a template:</p>
                <div className="grid grid-cols-2 gap-2">
                  {QUICK_TEMPLATES.map((tpl) => (
                    <button
                      key={tpl.name}
                      onClick={() => {
                        setSteps(tpl.steps.map((s) => ({ ...s, id: `${Date.now()}-${Math.random()}` })))
                      }}
                      className="text-left px-3 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-all"
                    >
                      <p className="text-xs font-semibold text-slate-300">{tpl.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{tpl.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              {steps.map((step, idx) => (
                <div key={step.id}>
                  <StepCard
                    step={step}
                    index={idx}
                    total={steps.length}
                    onChange={(updated) => updateStep(step.id, updated)}
                    onDelete={() => deleteStep(step.id)}
                    onMoveUp={() => moveStep(step.id, -1)}
                    onMoveDown={() => moveStep(step.id, 1)}
                  />
                  {/* Insert step button between cards */}
                  <div className="flex justify-center my-1">
                    <button
                      onClick={() => addStep(idx)}
                      className="w-5 h-5 flex items-center justify-center rounded-full bg-slate-700 hover:bg-sky-700 border border-slate-600 hover:border-sky-500 text-slate-500 hover:text-sky-300 transition-all opacity-0 hover:opacity-100 focus:opacity-100 group-hover:opacity-100"
                      title="Insert step here"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}

              {/* Add at bottom */}
              <button
                onClick={() => addStep(steps.length - 1)}
                className="w-full py-3 border border-dashed border-slate-700 hover:border-sky-500/50 rounded-xl text-slate-600 hover:text-sky-400 text-sm transition-all flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" /> Add Step
              </button>
            </>
          )}
        </div>

        {/* ── Code Preview Panel ── */}
        {showPreview && (
          <div className="w-96 flex-shrink-0 border-l border-slate-800 flex flex-col">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800 bg-slate-900/50">
              <div className="flex items-center gap-2">
                <Code2 className="w-3.5 h-3.5 text-violet-400" />
                <span className="text-xs font-semibold text-slate-300">Generated Code</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleCopy}
                  className="btn-icon text-xs px-2 py-1 hover:bg-slate-700 text-slate-400 hover:text-slate-200"
                >
                  <Copy className="w-3 h-3" />
                  {copied ? 'Copied!' : 'Copy'}
                </button>
                <button
                  onClick={() => setShowPreview(false)}
                  className="btn-icon hover:bg-slate-700 text-slate-500"
                >
                  ✕
                </button>
              </div>
            </div>
            <pre className="flex-1 overflow-auto p-4 text-xs text-slate-300 font-mono leading-relaxed bg-slate-950/50 whitespace-pre-wrap">
              {preview}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Quick Start Templates ────────────────────────────────────────────────────
const QUICK_TEMPLATES = [
  {
    name: '🔐 Login Flow',
    desc: 'Navigate → fill email → fill password → submit',
    steps: [
      { action: 'goto',    value: 'https://example.com/login', selectorMethod: 'css', selector: '', comment: 'Open login page' },
      { action: 'fill',    selector: 'email',   selectorMethod: 'placeholder', value: 'your@email.com', comment: 'Enter email' },
      { action: 'fill',    selector: 'password', selectorMethod: 'placeholder', value: 'yourpassword',  comment: 'Enter password' },
      { action: 'click',   selector: 'button[type="submit"]', selectorMethod: 'css', value: '', comment: 'Click login button' },
      { action: 'waitForURL', value: '**/dashboard**', selectorMethod: 'css', selector: '', comment: 'Wait until redirected to dashboard' },
    ],
  },
  {
    name: '🔍 Search & Scrape',
    desc: 'Search input → submit → wait for results',
    steps: [
      { action: 'goto',             value: 'https://example.com', selectorMethod: 'css', selector: '', comment: 'Open site' },
      { action: 'fill',             selector: 'search', selectorMethod: 'placeholder', value: 'query here', comment: 'Type search query' },
      { action: 'press',            selector: 'input[type="search"]', selectorMethod: 'css', value: 'Enter', comment: 'Submit search' },
      { action: 'waitForSelector',  selector: '.results', selectorMethod: 'css', value: '', comment: 'Wait for results to appear' },
      { action: 'getText',          selector: '.results', selectorMethod: 'css', value: 'results', comment: 'Read result text' },
    ],
  },
  {
    name: '📋 Form Fill',
    desc: 'Fill a contact / registration form',
    steps: [
      { action: 'goto',   value: 'https://example.com/contact', selectorMethod: 'css', selector: '', comment: 'Open form page' },
      { action: 'fill',   selector: 'name',    selectorMethod: 'placeholder', value: 'John Doe',     comment: 'Fill name' },
      { action: 'fill',   selector: 'email',   selectorMethod: 'placeholder', value: 'john@doe.com', comment: 'Fill email' },
      { action: 'fill',   selector: 'message', selectorMethod: 'placeholder', value: 'Hello!',       comment: 'Fill message' },
      { action: 'click',  selector: 'Submit',  selectorMethod: 'text',        value: '',             comment: 'Submit form' },
      { action: 'waitForSelector', selector: '.success', selectorMethod: 'css', value: '', comment: 'Confirm submission' },
    ],
  },
  {
    name: '📸 Screenshot',
    desc: 'Navigate and capture page screenshot',
    steps: [
      { action: 'goto',          value: 'https://example.com', selectorMethod: 'css', selector: '', comment: 'Open the page' },
      { action: 'waitForNetIdle', selectorMethod: 'css', selector: '', value: '', comment: 'Wait until fully loaded' },
      { action: 'screenshot',    value: '/tmp/page.png', selectorMethod: 'css', selector: '', comment: 'Capture full-page screenshot' },
      { action: 'log',           value: 'Screenshot saved!', selectorMethod: 'css', selector: '', comment: 'Confirm in logs' },
    ],
  },
]
