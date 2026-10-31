import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface SettingsOption {
  value: string;
  label: string;
  description?: string;
  badge?: string;
}

export default function SettingsSelect({ label, value, options, onChange, placeholder = '请选择', disabled = false, searchable = false }: {
  label: string;
  value: string;
  options: SettingsOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  searchable?: boolean;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 0, maxHeight: 320, transform: '' });
  const selected = options.find(option => option.value === value);
  const filtered = options.filter(option => `${option.label} ${option.description || ''} ${option.badge || ''}`.toLowerCase().includes(query.toLowerCase()));

  function close() { setOpen(false); setQuery(''); }
  function choose(option: SettingsOption) { onChange(option.value); close(); trigger.current?.focus(); }
  function show() {
    setQuery('');
    setActive(Math.max(0, options.findIndex(option => option.value === value)));
    setOpen(true);
  }

  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const rect = trigger.current!.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom - 18;
      const above = rect.top - 18;
      const upwards = below < 240 && above > below;
      const maxHeight = Math.max(100, Math.min(340, upwards ? above : below));
      const width = Math.min(Math.max(rect.width, 260), window.innerWidth - 32);
      setPosition({ left: Math.max(16, Math.min(rect.left, window.innerWidth - width - 16)), top: upwards ? rect.top - 7 : rect.bottom + 7, width, maxHeight, transform: upwards ? 'translateY(-100%)' : '' });
    }
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    function outside(event: PointerEvent) {
      if (!popup.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) close();
    }
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  useEffect(() => {
    if (open) popup.current?.querySelector(`[data-option-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  function keydown(event: React.KeyboardEvent) {
    if (open && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); trigger.current?.focus(); return; }
    if (open && event.key === 'Tab') { close(); trigger.current?.focus(); return; }
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) { event.preventDefault(); show(); }
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(index => filtered.length ? (index + (event.key === 'ArrowDown' ? 1 : -1) + filtered.length) % filtered.length : 0);
    } else if (event.key === 'Enter' || (event.key === ' ' && event.target === trigger.current)) {
      event.preventDefault();
      if (filtered[active]) choose(filtered[active]);
    } else if ((event.key === 'Home' || event.key === 'End') && event.target === trigger.current) {
      event.preventDefault(); setActive(event.key === 'Home' ? 0 : filtered.length - 1);
    }
  }

  return <div className="settings-select">
    <button ref={trigger} type="button" className={`settings-select-trigger${open ? ' is-open' : ''}`}
      role="combobox" aria-label={label} aria-expanded={open} aria-haspopup="listbox" aria-controls={`${id}-listbox`}
      aria-activedescendant={open && filtered[active] ? `${id}-option-${active}` : undefined}
      disabled={disabled} onClick={() => open ? close() : show()} onKeyDown={keydown}>
      <span className="settings-select-value"><span className={selected ? '' : 'settings-select-placeholder'}>{selected?.label || placeholder}</span>
        {selected?.badge ? <span className="settings-select-badge">{selected.badge}</span> : null}</span>
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="m4.5 6 3.5 3.5L11.5 6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>
    {open ? createPortal(<div ref={popup} className="settings-select-popover" style={position} onKeyDown={keydown} onClick={event => event.stopPropagation()}>
      {searchable ? <div className="settings-select-search"><input ref={search} aria-label={`搜索${label}`} placeholder="搜索名称或版本…" value={query}
        onChange={event => { setQuery(event.target.value); setActive(0); }} role="combobox" aria-expanded="true" aria-controls={`${id}-listbox`}
        aria-activedescendant={filtered[active] ? `${id}-option-${active}` : undefined} /></div> : null}
      <div id={`${id}-listbox`} role="listbox" aria-label={label} className="settings-select-options">
        {filtered.map((option, index) => <div key={option.value} id={`${id}-option-${index}`} role="option" aria-selected={option.value === value}
          data-option-index={index} className={`settings-select-option${active === index ? ' is-active' : ''}${option.value === value ? ' is-selected' : ''}`}
          onPointerMove={() => setActive(index)} onClick={() => choose(option)}>
          <div className="settings-select-option-copy"><div><span>{option.label}</span>{option.badge ? <span className="settings-select-badge">{option.badge}</span> : null}</div>
            {option.description ? <small>{option.description}</small> : null}</div>
          {option.value === value ? <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="m3.5 8 3 3 6-6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg> : null}
        </div>)}
        {!filtered.length ? <div className="settings-select-empty">没有匹配的选项</div> : null}
      </div>
    </div>, document.body) : null}
  </div>;
}
