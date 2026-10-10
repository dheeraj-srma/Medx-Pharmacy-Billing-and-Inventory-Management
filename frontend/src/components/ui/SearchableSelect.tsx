import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check, X } from "lucide-react";
import { searchAndRank, HighlightedText } from "@/lib/searchEngine";

export interface SearchableOption {
  value: string | number;
  label: string;
  subLabel?: string;
  badge?: string;
  raw?: any;
}

interface SearchableSelectProps {
  value?: string | number | null;
  onChange: (value: any, option?: SearchableOption) => void;
  options: SearchableOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  error?: boolean;
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Search & select...",
  className = "",
  disabled = false,
  error = false,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputText, setInputText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
    openUpwards: boolean;
  }>({
    top: 0,
    left: 0,
    width: 0,
    maxHeight: 260,
    openUpwards: false,
  });

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Active selected option
  const selectedOption = useMemo(() => {
    if (value === undefined || value === null || value === "") return null;
    return options.find((opt) => String(opt.value) === String(value)) || null;
  }, [value, options]);

  // Sync display text with selected option when not actively typing
  useEffect(() => {
    if (!isTyping) {
      setInputText(selectedOption ? selectedOption.label : "");
    }
  }, [selectedOption, isTyping]);

  // Calculate position relative to viewport for document.body portal
  const updatePosition = useCallback(() => {
    if (!inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const openUpwards = spaceBelow < 240 && spaceAbove > spaceBelow;

    setCoords({
      top: openUpwards ? rect.top - 4 : rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, 240),
      maxHeight: openUpwards ? Math.min(spaceAbove - 16, 260) : Math.min(spaceBelow - 16, 260),
      openUpwards,
    });
  }, []);

  // Filter options based on user typing using multi-tier search engine
  const filteredOptions = useMemo(() => {
    const q = isTyping ? inputText.trim() : "";
    if (!q) return options;

    const ranked = searchAndRank(
      options,
      q,
      (opt) => [opt.label, opt.subLabel, opt.badge]
    );
    return ranked.map((r) => r.item);
  }, [options, inputText, isTyping]);

  // Auto-scroll highlighted option into view
  useEffect(() => {
    if (isOpen && dropdownRef.current) {
      const listEl = dropdownRef.current.querySelector("ul");
      if (listEl && listEl.children[highlightedIndex]) {
        (listEl.children[highlightedIndex] as HTMLElement).scrollIntoView({
          block: "nearest",
        });
      }
    }
  }, [highlightedIndex, isOpen]);

  // Reposition on window scroll or resize
  useEffect(() => {
    if (!isOpen) return;
    updatePosition();

    const handleScrollOrResize = () => {
      updatePosition();
    };

    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);
    return () => {
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [isOpen, updatePosition]);

  // Handle outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
        setIsTyping(false);
        setInputText(selectedOption ? selectedOption.label : "");
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [isOpen, selectedOption]);

  const handleSelect = (opt: SearchableOption) => {
    onChange(opt.value, opt);
    setInputText(opt.label);
    setIsTyping(false);
    setIsOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setInputText(text);
    setIsTyping(true);
    setHighlightedIndex(0);
    if (!isOpen) {
      updatePosition();
      setIsOpen(true);
    }
  };

  const handleInputFocus = () => {
    updatePosition();
    setIsOpen(true);
    // Select all text so user can easily overwrite or see full list
    inputRef.current?.select();
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("", undefined);
    setInputText("");
    setIsTyping(true);
    setHighlightedIndex(0);
    inputRef.current?.focus();
    updatePosition();
    setIsOpen(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        e.preventDefault();
        updatePosition();
        setIsOpen(true);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < filteredOptions.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : filteredOptions.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredOptions.length > 0 && highlightedIndex < filteredOptions.length) {
        handleSelect(filteredOptions[highlightedIndex]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
      setIsTyping(false);
      setInputText(selectedOption ? selectedOption.label : "");
    }
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Searchable Input Box (The selection box IS the search box) */}
      <div className="relative w-full">
        <input
          ref={inputRef}
          type="text"
          disabled={disabled}
          value={inputText}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={`flex h-10 w-full rounded-md border bg-slate-950/80 px-3 py-2 pr-14 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 transition-colors ${
            error
              ? "border-rose-500/80 ring-1 ring-rose-500/40"
              : isOpen
              ? "border-indigo-500 ring-1 ring-indigo-500/50"
              : "border-slate-800 hover:border-slate-700"
          }`}
        />

        {/* Right Action Icons (Clear X & Chevron) */}
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-slate-400">
          {inputText && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
              title="Clear selection"
            >
              <X size={14} />
            </button>
          )}
          <button
            type="button"
            tabIndex={-1}
            onClick={() => {
              if (isOpen) {
                setIsOpen(false);
                setIsTyping(false);
                setInputText(selectedOption ? selectedOption.label : "");
              } else {
                inputRef.current?.focus();
              }
            }}
            className="p-1 hover:text-slate-200 transition-colors"
          >
            <ChevronDown
              size={15}
              className={`transition-transform duration-200 ${isOpen ? "rotate-180 text-indigo-400" : ""}`}
            />
          </button>
        </div>
      </div>

      {/* Floating Dropdown Panel rendered via Portal to document.body */}
      {isOpen &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{
              position: "fixed",
              left: `${coords.left}px`,
              top: coords.openUpwards ? "auto" : `${coords.top}px`,
              bottom: coords.openUpwards ? `${window.innerHeight - coords.top}px` : "auto",
              width: `${coords.width}px`,
              maxHeight: `${coords.maxHeight}px`,
              zIndex: 99999,
            }}
            className="rounded-lg border border-slate-700/90 bg-slate-900/95 backdrop-blur-md p-1 shadow-2xl shadow-black overflow-y-auto animate-in fade-in-0 zoom-in-95 duration-100"
          >
            <ul className="divide-y divide-slate-800/40 text-xs">
              {filteredOptions.length === 0 ? (
                <li className="px-3 py-5 text-center text-slate-500">
                  <p className="text-xs font-medium">No matches found</p>
                  <p className="text-[11px] text-slate-600 mt-0.5">Try searching with another keyword</p>
                </li>
              ) : (
                filteredOptions.map((opt, index) => {
                  const isSelected = selectedOption && String(selectedOption.value) === String(opt.value);
                  const isHighlighted = index === highlightedIndex;

                  return (
                    <li
                      key={opt.value}
                      onMouseDown={(e) => {
                        // Use onMouseDown so it executes before onBlur fires
                        e.preventDefault();
                        handleSelect(opt);
                      }}
                      onMouseEnter={() => setHighlightedIndex(index)}
                      className={`flex items-center justify-between px-3 py-2 rounded-md cursor-pointer transition-colors ${
                        isHighlighted
                          ? "bg-indigo-600/25 text-indigo-100"
                          : isSelected
                          ? "bg-slate-800/70 text-slate-100"
                          : "text-slate-300 hover:bg-slate-800/40"
                      }`}
                    >
                      <div className="flex flex-col flex-1 min-w-0 pr-2">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`font-medium truncate ${
                              isSelected ? "text-indigo-300 font-semibold" : ""
                            }`}
                          >
                            <HighlightedText text={opt.label} query={isTyping ? inputText : ""} />
                          </span>
                          {isSelected && <Check size={14} className="text-emerald-400 shrink-0" />}
                        </div>
                        {opt.subLabel && (
                          <span className="text-[11px] text-slate-400 truncate mt-0.5">
                            {opt.subLabel}
                          </span>
                        )}
                      </div>
                      {opt.badge && (
                        <span className="text-[10px] font-mono text-slate-300 bg-slate-800/90 px-1.5 py-0.5 rounded border border-slate-700/60 shrink-0">
                          {opt.badge}
                        </span>
                      )}
                    </li>
                  );
                })
              )}
            </ul>
          </div>,
          document.body
        )}
    </div>
  );
}
