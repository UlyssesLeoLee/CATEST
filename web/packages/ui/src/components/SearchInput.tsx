import React from "react";
import { Search } from "lucide-react";
import { cn } from "../lib/utils";

interface SearchInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  containerClassName?: string;
}

export function SearchInput({ className, containerClassName, ...props }: SearchInputProps) {
  return (
    <div className={cn("relative group w-full", containerClassName)}>
      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
        <Search className="h-4 w-4 text-[#b8a080] group-focus-within:text-[#c9a84c] transition-colors" />
      </div>
      <input
        type="text"
        className={cn(
          "block w-full pl-10 pr-4 py-2.5 bg-[#0d0a04]/60 border border-[#b87333]/20 rounded-xl text-sm text-[#e8d5b5] placeholder-[#b8a080]/50 focus:outline-none focus:ring-2 focus:ring-[#b87333]/20 focus:border-[#b87333]/50 transition-all duration-200",
          className
        )}
        {...props}
      />
    </div>
  );
}
