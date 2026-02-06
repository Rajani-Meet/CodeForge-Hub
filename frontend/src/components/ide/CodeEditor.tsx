"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import Editor, { useMonaco } from "@monaco-editor/react";
import { useIdeStore } from "@/store/ide-store";
import { X, Circle, Save, Check, Loader2, Sparkles, Code2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

// Detect if user is on Mac
const isMac = typeof window !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
const modKey = isMac ? '⌘' : 'Ctrl';

const TabBar = () => {
    const { openFiles, activeFile, setActiveFile, closeFile, unsavedFiles, fetchFileContent } = useIdeStore();

    if (openFiles.length === 0) return null;

    const handleTabClick = async (fileId: string) => {
        setActiveFile(fileId);
        await fetchFileContent(fileId);
    };

    const getFileName = (path: string) => {
        const parts = path.split('/');
        return parts[parts.length - 1];
    };

    return (
        <div className="flex bg-[#0D1117] border-b border-white/5 overflow-x-auto hide-scrollbar">
            <AnimatePresence>
                {openFiles.map((fileId, index) => (
                    <motion.div
                        key={fileId}
                        onClick={() => handleTabClick(fileId)}
                        className={cn(
                            "group flex items-center min-w-[140px] max-w-[220px] h-10 px-4 border-r border-white/5 text-xs cursor-pointer select-none transition-all duration-200 relative overflow-hidden",
                            activeFile === fileId
                                ? "bg-[#161b22] text-white"
                                : "text-slate-400 hover:bg-[#161b22]/50 hover:text-slate-200"
                        )}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.2, delay: index * 0.05 }}
                    >
                        {activeFile === fileId && (
                            <motion.div
                                layoutId="activeTabIndicator"
                                className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-accent-purple to-accent-blue"
                            />
                        )}

                        <div className="flex items-center gap-2.5 flex-1 overflow-hidden z-10 font-mono">
                            <span className={cn(
                                "w-3 h-3 shrink-0",
                                fileId.endsWith('ts') || fileId.endsWith('tsx') ? 'text-accent-blue' :
                                    fileId.endsWith('py') ? 'text-accent-yellow' :
                                        fileId.endsWith('java') ? 'text-accent-red' :
                                            fileId.endsWith('css') ? 'text-accent-cyan' : 'text-slate-400'
                            )}>
                                {fileId.endsWith('tsx') || fileId.endsWith('jsx') ? '⚛' : '#'}
                            </span>
                            <span className="truncate">{getFileName(fileId)}</span>
                        </div>

                        <motion.button
                            onClick={(e) => {
                                e.stopPropagation();
                                closeFile(fileId);
                            }}
                            className={cn(
                                "ml-2 p-0.5 rounded-full opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-all text-slate-400 hover:text-white z-10",
                                unsavedFiles.has(fileId) && "opacity-100"
                            )}
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                        >
                            {unsavedFiles.has(fileId) ? (
                                <Circle className="w-2 h-2 fill-current text-primary" />
                            ) : (
                                <X className="w-3 h-3" />
                            )}
                        </motion.button>

                        {/* Tab hover glow */}
                        <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
};

export default function CodeEditor() {
    const {
        activeFile,
        activeFileContent,
        activeFileLanguage,
        setActiveFileContent,
        saveActiveFile,
        unsavedFiles
    } = useIdeStore();

    const monaco = useMonaco();
    const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [showSaved, setShowSaved] = useState(false);

    useEffect(() => {
        if (monaco) {
            monaco.editor.defineTheme("codeforgehub-dark", {
                base: "vs-dark",
                inherit: true,
                rules: [
                    { token: 'keyword', foreground: 'ff7b72', fontStyle: 'bold' },
                    { token: 'string', foreground: 'a5d6ff' },
                    { token: 'comment', foreground: '8b949e', fontStyle: 'italic' },
                    { token: 'number', foreground: 'ffbd2e' },
                    { token: 'function', foreground: 'd2a8ff' },
                    { token: 'type', foreground: '79c0ff' },
                    { token: 'delimiter', foreground: 'c9d1d9' },
                ],
                colors: {
                    "editor.background": "#0D1117",
                    "editor.foreground": "#c9d1d9",
                    "editor.lineHighlightBackground": "#161b22",
                    "editor.selectionBackground": "#3B82F640",
                    "editorCursor.foreground": "#ec4899", // Pink cursor
                    "editorWhitespace.foreground": "#21262d",
                    "editorIndentGuide.background": "#21262d",
                    "editorIndentGuide.activeBackground": "#3c3cf6",
                    "editor.lineNumberForeground": "#484f58",
                },
            });
            monaco.editor.setTheme("codeforgehub-dark");
        }
    }, [monaco]);

    const performSave = useCallback(async () => {
        setIsSaving(true);
        await saveActiveFile();
        setIsSaving(false);
        setShowSaved(true);
        setTimeout(() => setShowSaved(false), 2000);
    }, [saveActiveFile]);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 's') {
            e.preventDefault();
            performSave();
        }
    }, [performSave]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    const handleEditorChange = useCallback((value: string | undefined) => {
        if (value !== undefined) {
            setActiveFileContent(value);

            if (autoSaveTimerRef.current) {
                clearTimeout(autoSaveTimerRef.current);
            }

            autoSaveTimerRef.current = setTimeout(async () => {
                setIsSaving(true);
                await saveActiveFile();
                setIsSaving(false);
                setShowSaved(true);
                setTimeout(() => setShowSaved(false), 2000);
            }, 1500);
        }
    }, [setActiveFileContent, saveActiveFile]);

    useEffect(() => {
        return () => {
            if (autoSaveTimerRef.current) {
                clearTimeout(autoSaveTimerRef.current);
            }
        };
    }, []);

    if (!activeFile) {
        return (
            <motion.div
                className="h-full w-full flex items-center justify-center bg-background-dark relative overflow-hidden"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
            >
                {/* Decoration */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/5 blur-[100px] rounded-full pointer-events-none"></div>

                <div className="flex flex-col items-center gap-6 relative z-10">
                    <motion.div
                        className="w-24 h-24 rounded-3xl bg-surface-dark border border-white/10 flex items-center justify-center shadow-2xl relative group"
                        initial={{ scale: 0.8 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", stiffness: 300 }}
                    >
                        <div className="absolute inset-0 bg-primary/20 blur-xl rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                        <Code2 className="w-10 h-10 text-primary relative z-10" />
                        <motion.div
                            className="absolute -top-3 -right-3 text-accent-neon"
                            animate={{ rotate: 360, scale: [1, 1.2, 1] }}
                            transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                        >
                            <Sparkles className="w-6 h-6" />
                        </motion.div>
                    </motion.div>

                    <div className="text-center">
                        <h3 className="text-xl font-bold text-white font-display mb-2">Ready to Forge</h3>
                        <p className="text-slate-400 font-sans max-w-xs mx-auto">
                            Select a file from the explorer or create a new one to start crafting your code.
                        </p>
                    </div>

                    <div className="flex gap-4">
                        <div className="px-4 py-2 rounded-lg bg-white/5 border border-white/5 text-xs text-slate-500 font-mono">
                            {modKey} + P to search
                        </div>
                        <div className="px-4 py-2 rounded-lg bg-white/5 border border-white/5 text-xs text-slate-500 font-mono">
                            {modKey} + ` to terminal
                        </div>
                    </div>
                </div>
            </motion.div>
        );
    }

    const getLanguage = (filename: string) => {
        if (activeFileLanguage && activeFileLanguage !== 'plaintext') return activeFileLanguage;
        if (filename.endsWith(".tsx")) return "typescriptreact";
        if (filename.endsWith(".ts")) return "typescript";
        if (filename.endsWith(".jsx")) return "javascriptreact";
        if (filename.endsWith(".js")) return "javascript";
        if (filename.endsWith(".css")) return "css";
        if (filename.endsWith(".json")) return "json";
        if (filename.endsWith(".html")) return "html";
        if (filename.endsWith(".md")) return "markdown";
        if (filename.endsWith(".py")) return "python";
        if (filename.endsWith(".java")) return "java";
        return "plaintext";
    };

    return (
        <motion.div
            className="h-full w-full flex flex-col bg-background-dark min-w-0 min-h-0 relative"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
        >
            <TabBar />

            {/* Save status indicator - updated style */}
            <AnimatePresence>
                <div className="absolute top-14 right-6 z-10 pointer-events-none">
                    {isSaving && (
                        <motion.div
                            className="flex items-center gap-2 px-3 py-1.5 bg-surface-dark/90 backdrop-blur-md border border-white/10 rounded-lg text-xs text-slate-300 shadow-xl"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                        >
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                            <span className="font-mono">Saving...</span>
                        </motion.div>
                    )}
                    {showSaved && !isSaving && (
                        <motion.div
                            className="flex items-center gap-2 px-3 py-1.5 bg-accent-neon/10 backdrop-blur-md border border-accent-neon/20 rounded-lg text-xs text-accent-neon shadow-xl"
                            initial={{ opacity: 0, x: 20, scale: 0.9 }}
                            animate={{ opacity: 1, x: 0, scale: 1 }}
                            exit={{ opacity: 0, x: 20, scale: 0.9 }}
                        >
                            <Check className="w-3.5 h-3.5" />
                            <span className="font-mono">Saved</span>
                        </motion.div>
                    )}
                </div>
            </AnimatePresence>

            <div className="flex-1 relative">
                <Editor
                    height="100%"
                    path={activeFile}
                    language={getLanguage(activeFile)}
                    value={activeFileContent}
                    theme="codeforgehub-dark"
                    onChange={handleEditorChange}
                    options={{
                        minimap: { enabled: true, side: 'right' },
                        fontSize: 14,
                        lineHeight: 22,
                        padding: { top: 20, bottom: 20 },
                        fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
                        fontLigatures: true,
                        scrollBeyondLastLine: false,
                        smoothScrolling: true,
                        cursorBlinking: "smooth",
                        cursorSmoothCaretAnimation: "on",
                        autoClosingBrackets: "always",
                        formatOnPaste: true,
                        bracketPairColorization: { enabled: true },
                        guides: { bracketPairs: true, indentation: true },
                    }}
                />
            </div>
        </motion.div>
    );
}
