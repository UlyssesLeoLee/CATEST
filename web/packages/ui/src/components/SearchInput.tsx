import React from "react";
import { Search, Command } from "lucide-react";
import { cn } from "../lib/utils";

interface SearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  containerClassName?: string;
}

export function SearchInput({ className, containerClassName, ...props }: SearchInputProps) {
  return (
    <div className={cn("relative group w-full", containerClassName)}>
      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
        <Search className="h-4 w-4 text-zinc-500 group-focus-within:text-indigo-400 transition-colors" />
      </div>
      <input
        type="text"
        className={cn(
          "block w-full pl-10 pr-12 py-2.5 bg-zinc-900/50 border border-zinc-800 rounded-xl text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/50 transition-all duration-200",
          className
        )}
        {...props}
      />
      <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
        <kbd className="hidden sm:inline-flex items-center gap-1 h-5 px-1.5 font-sans text-[10px] font-medium text-zinc-500 bg-zinc-800 border border-zinc-700 rounded-md">
          <Command className="w-2.5 h-2.5" /> K
        </kbd>
      </div>
    </div>
  );
}
