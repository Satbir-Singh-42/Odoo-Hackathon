'use client';

import { useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback, CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, X, Plus } from 'lucide-react';

interface Option {
  value: string;
  label: string;
  sublabel?: string;
}

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
  creatable?: boolean;
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Select an option',
  required = false,
  disabled = false,
  className = '',
  allowEmpty = false,
  emptyLabel = 'Select an option',
  creatable = false,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  // Start hidden — position is calculated before first paint via useLayoutEffect
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({ visibility: 'hidden', position: 'fixed' });

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Track when we last opened so we can ignore scroll events from mobile keyboard animation
  const openedAtRef = useRef<number>(0);

  // Calculate fixed position directly from DOM — no state dependencies to avoid race conditions.
  const updateMenuPosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const vh = window.innerHeight;
    const OFFSET = 4;
    const PREFERRED_HEIGHT = 240;

    const spaceBelow = vh - rect.bottom - OFFSET;
    const spaceAbove = rect.top - OFFSET;
    const shouldOpenUpward = spaceBelow < PREFERRED_HEIGHT && spaceAbove > spaceBelow;
    const maxH = Math.min(PREFERRED_HEIGHT, shouldOpenUpward ? spaceAbove : spaceBelow);

    setMenuStyle({
      position: 'fixed',
      left: rect.left,
      width: rect.width,
      zIndex: 99999,
      maxHeight: `${Math.max(80, maxH)}px`,
      visibility: 'visible',
      ...(shouldOpenUpward
        ? { bottom: vh - rect.top + OFFSET }
        : { top: rect.bottom + OFFSET }),
    });
  }, []);

  // Calculate position before first paint (avoids flash at 0,0)
  useLayoutEffect(() => {
    if (!isOpen) return;
    updateMenuPosition();
  }, [isOpen, updateMenuPosition]);

  // Close when any ancestor scrolls, but:
  // 1. Ignore scrolls inside the dropdown itself
  // 2. Ignore scrolls within 400ms of opening (mobile virtual keyboard push)
  // Update position on resize
  useEffect(() => {
    if (!isOpen) return;

    const handleScroll = (e: Event) => {
      if (dropdownRef.current?.contains(e.target as Node)) return;
      // Tolerate scroll caused by mobile keyboard animation just after open
      if (Date.now() - openedAtRef.current < 400) return;
      setIsOpen(false);
      setSearchQuery('');
    };

    const handleResize = () => updateMenuPosition();

    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [isOpen, updateMenuPosition]);

  // Derived display value
  const selectedOption = options.find((opt) => opt.value === value);
  const displayValue = selectedOption ? selectedOption.label : value;

  const filteredOptions = useMemo(() => {
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        option.value.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (option.sublabel || '').toLowerCase().includes(searchQuery.toLowerCase()),
    );
  }, [options, searchQuery]);

  const showCreatableOption =
    creatable &&
    searchQuery.trim() !== '' &&
    !options.some(
      (opt) =>
        opt.label.toLowerCase() === searchQuery.toLowerCase() ||
        opt.value.toLowerCase() === searchQuery.toLowerCase(),
    );

  // Close when clicking/tapping outside — handles both mouse and touch
  useEffect(() => {
    const handleOutside = (event: PointerEvent | MouseEvent | TouchEvent) => {
      const target = (
        'touches' in event ? event.touches[0]?.target : event.target
      ) as Node | null;
      if (!target) return;
      const clickedContainer = containerRef.current?.contains(target);
      const clickedMenu = dropdownRef.current?.contains(target);
      if (!clickedContainer && !clickedMenu) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };
    document.addEventListener('pointerdown', handleOutside as EventListener);
    // Keep mousedown/touchstart as fallbacks for older browsers if needed, 
    // but pointerdown is the primary mechanism to fix the open->close race
    document.addEventListener('mousedown', handleOutside as EventListener);
    document.addEventListener('touchstart', handleOutside as EventListener, { passive: true });
    return () => {
      document.removeEventListener('pointerdown', handleOutside as EventListener);
      document.removeEventListener('mousedown', handleOutside as EventListener);
      document.removeEventListener('touchstart', handleOutside as EventListener);
    };
  }, []);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault();
        openDropdown();
      }
      return;
    }

    const totalOptionsCount = filteredOptions.length + (showCreatableOption ? 1 : 0);

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev < totalOptionsCount - 1 ? prev + 1 : prev));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex < 0) break;
        if (showCreatableOption && highlightedIndex === filteredOptions.length) {
          handleSelectOption(searchQuery.trim());
        } else if (filteredOptions[highlightedIndex]) {
          handleSelectOption(filteredOptions[highlightedIndex].value);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setSearchQuery('');
        break;
    }
  };

  const handleSelectOption = (optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
    setSearchQuery('');
    setHighlightedIndex(0);
  };

  const openDropdown = useCallback(() => {
    if (disabled) return;
    openedAtRef.current = Date.now();
    if (creatable && value) {
      setSearchQuery(displayValue);
    }
    setIsOpen(true);
    // Use rAF so DOM is updated before we try to focus
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [disabled, creatable, value, displayValue]);

  // --- Mobile fix: use onPointerDown on the trigger div ---
  // On mobile, the browser fires: pointerdown → focus → click.
  // If we only use onClick or onFocus, the dropdown opens and may close due to the
  // competing events (focus fires blur on previously focused element, triggering scroll etc.).
  // By using onPointerDown + e.preventDefault(), we:
  //   1. Stop the native focus from firing (preventing the race)
  //   2. Manually call focus() after setting state, so the keyboard still appears
  //   3. Toggle closed if already open (second tap = close)
  const handleTriggerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    // Only handle primary pointer (left mouse button / first touch)
    if ('button' in e && e.button !== 0) return;
    // Prevent the browser's default focus event so there's no open→close race
    e.preventDefault();

    if (isOpen) {
      setIsOpen(false);
      setSearchQuery('');
    } else {
      openDropdown();
    }
  };

  useEffect(() => {
    setHighlightedIndex(-1);
  }, [searchQuery]);

  useEffect(() => {
    if (isOpen) {
      const el = document.getElementById(`option-${highlightedIndex}`);
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [highlightedIndex, isOpen]);

  // Reset to hidden when closed so next open doesn't flash old position
  useEffect(() => {
    if (!isOpen) {
      setMenuStyle({ visibility: 'hidden', position: 'fixed' });
    }
  }, [isOpen]);

  // Native form validation bridge for custom select controls.
  // The visible input is readonly while closed, so required alone is unreliable.
  // Use custom validity so reportValidity() can show the browser message.
  useEffect(() => {
    if (!inputRef.current) return;
    if (required && !disabled && !value) {
      inputRef.current.setCustomValidity('Please fill in this field.');
    } else {
      inputRef.current.setCustomValidity('');
    }
  }, [required, disabled, value]);

  const dropdownMenu = isOpen ? (
    <div
      ref={dropdownRef}
      style={menuStyle}
      className="bg-white border border-gray-300 rounded-lg shadow-xl overflow-y-auto"
    >
      {allowEmpty && (
        <div
          className={`px-3 sm:px-4 py-2 cursor-pointer transition-colors text-sm sm:text-base ${
            value === '' ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-100'
          }`}
          onPointerDown={(e) => { e.preventDefault(); handleSelectOption(''); }}
        >
          {emptyLabel}
        </div>
      )}

      {filteredOptions.length === 0 && !showCreatableOption ? (
        <div className="px-3 sm:px-4 py-3 text-gray-500 text-center text-sm">
          No options found
        </div>
      ) : (
        <>
          {filteredOptions.map((option, index) => (
            <div
              key={option.value ?? index}
              id={`option-${index}`}
              className={`px-3 sm:px-4 py-2 cursor-pointer transition-colors
                ${option.value === value ? 'bg-blue-50 text-blue-700 font-normal' : ''}
                ${index === highlightedIndex ? 'bg-gray-100' : 'hover:bg-gray-100'}`}
              onPointerDown={(e) => { e.preventDefault(); handleSelectOption(option.value); }}
              onMouseEnter={() => setHighlightedIndex(index)}
            >
              <div className="text-sm sm:text-base leading-tight">{option.label}</div>
              {option.sublabel && (
                <div className="text-xs text-gray-400 mt-0.5 leading-tight truncate">{option.sublabel}</div>
              )}
            </div>
          ))}

          {showCreatableOption && (
            <div
              id={`option-${filteredOptions.length}`}
              className={`px-3 sm:px-4 py-2 cursor-pointer transition-colors text-sm sm:text-base
                flex items-center gap-2 border-t border-gray-100
                ${
                  highlightedIndex === filteredOptions.length
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-blue-600 hover:bg-gray-100'
                }`}
              onPointerDown={(e) => { e.preventDefault(); handleSelectOption(searchQuery.trim()); }}
              onMouseEnter={() => setHighlightedIndex(filteredOptions.length)}
            >
              <Plus className="w-4 h-4" />
              <span>Add "{searchQuery}"</span>
            </div>
          )}
        </>
      )}
    </div>
  ) : null;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger */}
      <div
        ref={triggerRef}
        className={`ui-control w-full h-9 sm:h-10 flex items-center
          ${disabled ? '!bg-gray-100 cursor-not-allowed' : 'bg-white cursor-pointer'}`}
        onPointerDown={handleTriggerPointerDown}
      >
        <input
          ref={inputRef}
          type="text"
          value={isOpen ? searchQuery : displayValue}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={false}
          className={`flex-1 min-w-0 h-full pl-3 pr-1 outline-none bg-transparent text-sm font-normal
            ${disabled ? 'cursor-not-allowed text-gray-500' : 'cursor-pointer'}`}
          required={required}
          // onFocus intentionally omitted — open state is controlled exclusively
          // via onPointerDown on the trigger to prevent the double-tap issue on mobile.
        />

        <div className="flex items-center pr-2 gap-0.5 shrink-0">
          {value && !required && !disabled && (
            <button
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onChange('');
                setSearchQuery('');
              }}
              className="p-1 hover:bg-gray-100 rounded transition-colors"
              tabIndex={-1}
            >
              <X className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600" />
            </button>
          )}
          <ChevronDown
            className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </div>
      </div>

      {/* Portal: renders menu into document.body — bypasses all overflow clipping */}
      {typeof document !== 'undefined' && createPortal(dropdownMenu, document.body)}
    </div>
  );
}