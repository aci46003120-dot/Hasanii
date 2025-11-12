import React, { useState, useEffect, useCallback, useRef } from 'react';
import { WordEntry, PartOfSpeech, LOCAL_STORAGE_KEYS, ConversationFeedback, ReplacementRule, PendingExclusion, KnowledgeDocument, ChatMessage } from './types';
import * as geminiService from './services/geminiService';
import { LiveSession, FunctionCall, LiveServerMessage, Blob as GeminiBlob } from '@google/genai';
import { useLocalStorage } from './hooks/useLocalStorage';
import { Button, Notification } from './components/UI';
import { DatabaseIcon, RefreshIcon, ChatIcon, DocumentTextIcon, TestTubeIcon, BrainIcon, PhoneIcon, BookOpenIcon, SunIcon, MoonIcon, AcademicCapIcon } from './components/Icons';
import ExtractorView from './tabs/ExtractorTab';
import DatabaseView from './tabs/DatabaseTab';
import TestingTab from './tabs/TestingTab';
import ChatTab from './tabs/ChatTab';
import TrainingDataTab from './tabs/TrainingDataTab';
import LiveCallView from './components/LiveCallView';
import ComprehensionTab from './tabs/ComprehensionTab';
import KnowledgeTab from './tabs/KnowledgeTab';
import SimpleUserView from './components/SimpleUserView';
import { generateUUID } from './utils';

type View = 'extractor' | 'comprehension' | 'database' | 'testing' | 'chat' | 'training' | 'knowledge';

const TabButton: React.FC<{
    isActive: boolean;
    onClick: () => void;
    children: React.ReactNode;
    icon: React.ReactNode;
}> = ({ isActive, onClick, children, icon }) => (
    <button
        onClick={onClick}
        className={`flex items-center gap-2 px-3 py-3 text-sm font-medium border-b-2 transition-colors ${
            isActive
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600'
        }`}
    >
        {icon}
        {children}
    </button>
);


const App: React.FC = () => {
    // State
    const [database, setDatabase] = useLocalStorage<WordEntry[]>(LOCAL_STORAGE_KEYS.DATABASE, []);
    const [pendingWords, setPendingWords] = useLocalStorage<Partial<WordEntry>[]>(LOCAL_STORAGE_KEYS.PENDING, []);
    const [excludedWords, setExcludedWords] = useLocalStorage<Partial<WordEntry>[]>(LOCAL_STORAGE_KEYS.EXCLUDED, []);
    const [conversationFeedback, setConversationFeedback] = useLocalStorage<ConversationFeedback[]>(LOCAL_STORAGE_KEYS.CONVERSATION_FEEDBACK, []);
    const [customInstructions, setCustomInstructions] = useLocalStorage<string>(LOCAL_STORAGE_KEYS.CUSTOM_INSTRUCTIONS, '');
    const [replacementMap, setReplacementMap] = useLocalStorage<ReplacementRule[]>(LOCAL_STORAGE_KEYS.REPLACEMENTS, []);
    const [pendingExclusions, setPendingExclusions] = useLocalStorage<PendingExclusion[]>(LOCAL_STORAGE_KEYS.PENDING_EXCLUSIONS, []);
    const [knowledgeBase, setKnowledgeBase] = useLocalStorage<KnowledgeDocument[]>(LOCAL_STORAGE_KEYS.KNOWLEDGE_BASE, []);
    const [userStyleProfile, setUserStyleProfile] = useLocalStorage<string>(LOCAL_STORAGE_KEYS.USER_STYLE_PROFILE, '');
    const [view, setView] = useState<View>('extractor');
    const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({});
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [theme, setTheme] = useLocalStorage<'light' | 'dark'>('theme', 'dark');
    const [isSimpleUserView, setIsSimpleUserView] = useState(false);

    // Live Session State
    const [isLiveSessionActive, setIsLiveSessionActive] = useState(false);
    const [liveTranscript, setLiveTranscript] = useState<{ speaker: 'user' | 'model', text: string }[]>([]);
    const [useDatabaseForLive, setUseDatabaseForLive] = useState(false);
    const [useWebSearchForLive, setUseWebSearchForLive] = useState(false);
    const [useKnowledgeForLive, setUseKnowledgeForLive] = useState(false);
    const [callStatus, setCallStatus] = useState<'idle' | 'connecting' | 'connected' | 'ended' | 'error'>('idle');
    const [callDuration, setCallDuration] = useState(0);
    const [isMuted, setIsMuted] = useState(false);

    const liveSessionRef = useRef<LiveSession | null>(null);
    const inputAudioContextRef = useRef<AudioContext | null>(null);
    const outputAudioContextRef = useRef<AudioContext | null>(null);
    const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const sourcesRef = useRef(new Set<AudioBufferSourceNode>());
    const nextStartTimeRef = useRef(0);
    const currentInputTranscriptionRef = useRef('');
    const currentOutputTranscriptionRef = useRef('');

    // Theme Effect
    useEffect(() => {
        if (theme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prevTheme => (prevTheme === 'dark' ? 'light' : 'dark'));
    };

    // Timer Effect
    useEffect(() => {
        let interval: number | undefined;
        if (callStatus === 'connected') {
            interval = window.setInterval(() => {
                setCallDuration(prev => prev + 1);
            }, 1000);
        }
        return () => window.clearInterval(interval);
    }, [callStatus]);

    useEffect(() => {
        if (isSimpleUserView) {
            setUseDatabaseForLive(true);
            setUseWebSearchForLive(false);
            setUseKnowledgeForLive(false);
        }
    }, [isSimpleUserView]);

    // Handlers
    const setLoading = (key: string, value: boolean) => setLoadingStates(prev => ({ ...prev, [key]: value }));

    const showMessage = (setter: React.Dispatch<React.SetStateAction<string | null>>, message: string) => {
        setter(message);
        setTimeout(() => setter(null), 3000);
    };
    const handleError = useCallback((message: string) => showMessage(setError, message), []);
    const handleSuccess = useCallback((message: string) => showMessage(setSuccess, message), []);

    const addWordToPending = useCallback((word: Partial<WordEntry>, force = false) => {
        const hassaniyaLower = word.hassaniya?.toLowerCase();
        if (!hassaniyaLower) return;

        if (!force && database.some(w => w.hassaniya.toLowerCase() === hassaniyaLower)) {
            handleSuccess(`"${word.hassaniya}" موجودة بالفعل في قاعدة البيانات.`);
            return;
        }
    
        if (pendingWords.some(p => p.hassaniya?.toLowerCase() === hassaniyaLower)) {
            handleSuccess(`"${word.hassaniya}" موجودة بالفعل في قائمة المراجعة.`);
            return;
        }

        const newWord = { 
            ...word, 
            id: generateUUID(), 
            partOfSpeech: word.partOfSpeech || PartOfSpeech.Unspecified,
            dateAdded: new Date().toISOString(),
            notes: word.notes || '',
        };
        setPendingWords(prev => [newWord, ...prev]);
        handleSuccess(`تمت إضافة "${word.hassaniya}" للمراجعة.`);
    }, [database, pendingWords, setPendingWords, handleSuccess]);

    const addMultipleWordsToPending = useCallback((words: Partial<WordEntry>[], force = false) => {
        const pendingWordsSet = new Set(pendingWords.map(p => p.hassaniya?.toLowerCase()));
        const dbWordsSet = force ? new Set() : new Set(database.map(db => db.hassaniya.toLowerCase()));

        const wordsToAdd = words.filter(word => {
            const key = word.hassaniya?.toLowerCase();
            if (!key) return false;
            return !pendingWordsSet.has(key) && !dbWordsSet.has(key);
        });

        if (wordsToAdd.length === 0) {
            if (words.length > 0) {
                handleSuccess("لم يتم العثور على كلمات جديدة. قد تكون موجودة بالفعل في قاعدة البيانات أو قائمة المراجعة.");
            }
            return;
        }

        const newWordEntries = wordsToAdd.map(word => ({
            ...word,
            id: generateUUID(),
            partOfSpeech: word.partOfSpeech || PartOfSpeech.Unspecified,
            dateAdded: new Date().toISOString(),
            notes: word.notes || '',
        }));

        setPendingWords(prev => [...newWordEntries, ...prev]);
        handleSuccess(`تمت إضافة ${newWordEntries.length} كلمة جديدة للمراجعة.`);
    }, [database, pendingWords, setPendingWords, handleSuccess, handleError]);
    
    const addPendingExclusion = useCallback((incorrectWord: string, suggestedReplacement: string) => {
        const wordLower = incorrectWord.toLowerCase();
        if (pendingExclusions.some(pe => pe.incorrectWord.toLowerCase() === wordLower)) {
            console.log(`Suggestion to exclude "${incorrectWord}" is already pending.`);
            return;
        }
        const newExclusion: PendingExclusion = {
            id: generateUUID(),
            incorrectWord,
            suggestedReplacement,
            dateSuggested: new Date().toISOString(),
        };
        setPendingExclusions(prev => [newExclusion, ...prev]);
        handleSuccess(`تم اقتراح استبعاد "${incorrectWord}".`);
    }, [pendingExclusions, setPendingExclusions, handleSuccess]);

    const addReplacementRule = useCallback((original: string, replacement: string = '') => {
        const originalTrimmed = original.trim();
        if (!originalTrimmed) return;
        
        const originalLower = originalTrimmed.toLowerCase();

        if (replacementMap.some(r => r.original.toLowerCase() === originalLower)) {
            handleSuccess(`قاعدة للكلمة "${originalTrimmed}" موجودة بالفعل.`);
            return;
        }
        const newRule: ReplacementRule = {
            id: generateUUID(),
            original: originalTrimmed,
            replacement: replacement.trim(),
        };
        setReplacementMap(prev => [newRule, ...prev]);
        const action = replacement.trim() ? 'استبدال' : 'استبعاد';
        handleSuccess(`تمت إضافة قاعدة ${action} جديدة لـ "${originalTrimmed}".`);
    }, [replacementMap, setReplacementMap, handleSuccess]);


    const handleFunctionCall = useCallback((functionCall: FunctionCall) => {
        if (functionCall.name === 'add_word_to_pending_list') {
            const { hassaniya_word, arabic_meaning, part_of_speech } = functionCall.args;
            if (hassaniya_word && arabic_meaning && part_of_speech) {
                addWordToPending({
                    hassaniya: hassaniya_word,
                    arabic: arabic_meaning,
                    partOfSpeech: part_of_speech as PartOfSpeech,
                });
            }
        }
        if (functionCall.name === 'suggest_word_for_exclusion') {
            const { incorrect_word, suggested_replacement } = functionCall.args;
            if (incorrect_word && suggested_replacement) {
                addPendingExclusion(incorrect_word, suggested_replacement);
            }
        }
        if (functionCall.name === 'add_word_to_exclusion_list') {
            const { original_word, replacement_word } = functionCall.args;
            if (original_word) {
                addReplacementRule(original_word, replacement_word);
            }
        }
    }, [addWordToPending, addPendingExclusion, addReplacementRule]);

    const approveWord = useCallback((wordId: string) => {
        const wordToApprove = pendingWords.find(w => w.id === wordId);
        if (!wordToApprove) return;

        const finalWord: WordEntry = {
            id: wordToApprove.id || generateUUID(),
            hassaniya: wordToApprove.hassaniya || '',
            arabic: wordToApprove.arabic || '',
            partOfSpeech: wordToApprove.partOfSpeech || PartOfSpeech.Unspecified,
            dateAdded: wordToApprove.dateAdded || new Date().toISOString(),
            notes: wordToApprove.notes || '',
        };
        
        if (database.some(w => w.hassaniya.toLowerCase() === finalWord.hassaniya.toLowerCase())) {
            handleError(`"${finalWord.hassaniya}" موجودة بالفعل في قاعدة البيانات.`);
            setPendingWords(prev => prev.filter(p => p.id !== wordId));
            return;
        }

        setDatabase(prev => [...prev, finalWord].sort((a,b) => a.hassaniya.localeCompare(b.hassaniya, 'ar')));
        setPendingWords(prev => prev.filter(p => p.id !== wordId));
        handleSuccess(`تم تأكيد "${finalWord.hassaniya}".`);
    }, [pendingWords, setPendingWords, database, setDatabase, handleSuccess, handleError]);

    const rejectWord = useCallback((wordId: string) => {
        const wordToReject = pendingWords.find(w => w.id === wordId);
        if (!wordToReject) return;
        
        setExcludedWords(prev => [wordToReject, ...prev]);
        setPendingWords(prev => prev.filter(p => p.id !== wordId));
        handleSuccess(`تم رفض "${wordToReject.hassaniya}".`);
    }, [pendingWords, setPendingWords, setExcludedWords, handleSuccess]);

    const updatePendingWord = useCallback((updatedWord: Partial<WordEntry>) => {
        setPendingWords(prev => prev.map(p => p.id === updatedWord.id ? { ...p, ...updatedWord } : p));
    }, [setPendingWords]);
    
    const addConversationFeedback = useCallback((feedback: Omit<ConversationFeedback, 'id' | 'timestamp'>) => {
        const newFeedback: ConversationFeedback = {
            ...feedback,
            id: generateUUID(),
            timestamp: new Date().toISOString(),
        };
        setConversationFeedback(prev => [newFeedback, ...prev]);
        handleSuccess("شكراً لك! يتم استخدام ملاحظاتك لتحسين النموذج.");
    }, [setConversationFeedback, handleSuccess]);

    const deleteConversationFeedback = useCallback((feedbackId: string) => {
        setConversationFeedback(prev => prev.filter(f => f.id !== feedbackId));
        handleSuccess("تم حذف بيانات التدريب.");
    }, [setConversationFeedback, handleSuccess]);

    const updateConversationFeedback = useCallback((feedbackId: string, updates: Partial<ConversationFeedback>) => {
        setConversationFeedback(prev => 
            prev.map(f => f.id === feedbackId ? { ...f, ...updates } : f)
        );
    }, [setConversationFeedback]);

    const handleAnalyzeConversation = useCallback(async (transcript: (ChatMessage | { speaker: 'user' | 'model', text: string })[]) => {
        if (!transcript || transcript.length === 0) return;
        
        setLoading('style-analysis', true);
        try {
            const profile = await geminiService.analyzeAndGenerateStyleProfile(transcript);
            if (profile) {
                setUserStyleProfile(profile);
                handleSuccess("تم تحليل المحادثة وتحديث ملف الأسلوب الشخصي.");
            }
        } catch (err: any) {
            handleError(err.message || "فشل تحليل المحادثة.");
        } finally {
            setLoading('style-analysis', false);
        }
    }, [setUserStyleProfile, handleSuccess, handleError]);


    const toggleLiveSession = useCallback(async (options: { script?: string | null, customInstructions: string, useKnowledge: boolean, knowledgeBase: KnowledgeDocument[], userStyleProfile: string }) => {
        if (isLiveSessionActive) {
            liveSessionRef.current?.close();
            return;
        }

        try {
            setCallStatus('connecting');
            setCallDuration(0);
            setIsMuted(false);
            setLiveTranscript([]);
            currentInputTranscriptionRef.current = '';
            currentOutputTranscriptionRef.current = '';
            
            const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
            inputAudioContextRef.current = new AudioContext({ sampleRate: 16000 });
            outputAudioContextRef.current = new AudioContext({ sampleRate: 24000 });
            nextStartTimeRef.current = 0;
            
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaStreamRef.current = stream;

            const sessionPromise = geminiService.connectLive({
                onOpen: () => {
                    setIsLiveSessionActive(true);
                    setCallStatus('connected');
                    const source = inputAudioContextRef.current!.createMediaStreamSource(stream);
                    const processor = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);
                    scriptProcessorRef.current = processor;

                    processor.onaudioprocess = (audioProcessingEvent) => {
                        if (isMuted) return;
                        const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                        const pcmBlob: GeminiBlob = {
                            data: geminiService.encode(new Uint8Array(new Int16Array(inputData.map(x => x * 32768)).buffer)),
                            mimeType: 'audio/pcm;rate=16000',
                        };
                        sessionPromise.then((session) => {
                           session.sendRealtimeInput({ media: pcmBlob });
                        });
                    };
                    source.connect(processor);
                    processor.connect(inputAudioContextRef.current!.destination);
                },
                onMessage: async (message: LiveServerMessage) => {
                    if (message.toolCall) {
                        message.toolCall.functionCalls.forEach(handleFunctionCall);
                    }

                    if (message.serverContent?.inputTranscription) {
                        currentInputTranscriptionRef.current += message.serverContent.inputTranscription.text;
                    }
                    if (message.serverContent?.outputTranscription) {
                        currentOutputTranscriptionRef.current += message.serverContent.outputTranscription.text;
                    }

                    if (message.serverContent?.turnComplete) {
                        const userInput = currentInputTranscriptionRef.current.trim();
                        const modelOutput = currentOutputTranscriptionRef.current.trim();
                        
                        setLiveTranscript(prev => {
                            const newTranscript = [...prev];
                            if(userInput) newTranscript.push({ speaker: 'user', text: userInput });
                            if(modelOutput) newTranscript.push({ speaker: 'model', text: modelOutput });
                            return newTranscript;
                        });

                        currentInputTranscriptionRef.current = '';
                        currentOutputTranscriptionRef.current = '';
                    }

                    const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                    if (base64Audio) {
                        const outputCtx = outputAudioContextRef.current!;
                        nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
                        const audioBuffer = await geminiService.decodeAudioData(geminiService.decode(base64Audio), outputCtx, 24000, 1);
                        const sourceNode = outputCtx.createBufferSource();
                        sourceNode.buffer = audioBuffer;
                        sourceNode.connect(outputCtx.destination);
                        sourceNode.addEventListener('ended', () => sourcesRef.current.delete(sourceNode));
                        sourceNode.start(nextStartTimeRef.current);
                        nextStartTimeRef.current += audioBuffer.duration;
                        sourcesRef.current.add(sourceNode);
                    }
                    if (message.serverContent?.interrupted) {
                        sourcesRef.current.forEach(source => source.stop());
                        sourcesRef.current.clear();
                        nextStartTimeRef.current = 0;
                    }
                },
                onError: (e) => {
                    console.error('Live session error:', e);
                    handleError("حدث خطأ في الجلسة الصوتية.");
                    setCallStatus('error');
                    setIsLiveSessionActive(false);
                     setTimeout(() => setCallStatus('idle'), 2000);
                },
                onClose: () => {
                    scriptProcessorRef.current?.disconnect();
                    mediaStreamRef.current?.getTracks().forEach(track => track.stop());
                    if (inputAudioContextRef.current?.state !== 'closed') inputAudioContextRef.current?.close();
                    if (outputAudioContextRef.current?.state !== 'closed') outputAudioContextRef.current?.close();
                    liveSessionRef.current = null;
                    setIsLiveSessionActive(false);
                    setCallStatus('ended');

                    const finalInput = currentInputTranscriptionRef.current.trim();
                    const finalOutput = currentOutputTranscriptionRef.current.trim();
                    const finalTranscript = [...liveTranscript];
                    if (finalInput) finalTranscript.push({ speaker: 'user', text: finalInput });
                    if (finalOutput) finalTranscript.push({ speaker: 'model', text: finalOutput });

                    if (finalTranscript.length > 0) {
                        handleAnalyzeConversation(finalTranscript);
                    }

                    setTimeout(() => setCallStatus('idle'), 2000);
                },
            }, {
                script: options.script,
                useDatabase: useDatabaseForLive,
                useWebSearch: useWebSearchForLive,
                database: database,
                feedback: conversationFeedback,
                customInstructions: options.customInstructions,
                replacementMap: replacementMap,
                useKnowledge: options.useKnowledge,
                knowledgeBase: options.knowledgeBase,
                userStyleProfile: options.userStyleProfile,
            });
            
            liveSessionRef.current = await sessionPromise;

        } catch (err) {
            console.error(err);
            handleError("فشل بدء الجلسة. تحقق من أذونات الميكروفون.");
            setCallStatus('error');
            setTimeout(() => setCallStatus('idle'), 2000);
        }
    }, [isLiveSessionActive, handleSuccess, handleError, handleFunctionCall, useDatabaseForLive, useWebSearchForLive, database, conversationFeedback, replacementMap, isMuted, liveTranscript, handleAnalyzeConversation]);
    
    return (
        <div className="flex flex-col min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-sans">
            {success && <Notification message={success} type="success" onDismiss={() => setSuccess(null)} />}
            {error && <Notification message={error} type="error" onDismiss={() => setError(null)} />}
            {callStatus !== 'idle' && (
                <LiveCallView
                    status={callStatus}
                    duration={callDuration}
                    isMuted={isMuted}
                    onToggleMute={() => setIsMuted(prev => !prev)}
                    onEndCall={() => toggleLiveSession({ script: null, customInstructions, useKnowledge: useKnowledgeForLive, knowledgeBase, userStyleProfile })}
                />
            )}
            
            <header className="bg-white dark:bg-gray-800 shadow-sm p-4 sticky top-0 z-10">
                <div className="flex justify-between items-center max-w-5xl mx-auto">
                    <div className="flex justify-center items-center">
                        <DatabaseIcon className="w-8 h-8 text-blue-500" />
                        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-200 mr-2">محلل الكلمات الحسانية التفاعلي</h1>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={toggleTheme}
                            className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 p-2 rounded-full"
                            aria-label="Toggle theme"
                        >
                            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
                        </button>
                        <button
                            onClick={() => setIsSimpleUserView(prev => !prev)}
                            className="inline-flex items-center justify-center px-3 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-md text-sm font-semibold transition-colors"
                        >
                            {isSimpleUserView ? 'وضع المطور' : 'وضع المستخدم العادي'}
                        </button>
                        <button onClick={() => window.location.reload()} className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 p-2 rounded-full">
                            <RefreshIcon />
                        </button>
                    </div>
                </div>
                {!isSimpleUserView && (
                    <nav className="border-t border-gray-200 dark:border-gray-700 mt-4">
                        <div className="max-w-5xl mx-auto flex items-center justify-center sm:justify-start">
                            <TabButton isActive={view === 'extractor'} onClick={() => setView('extractor')} icon={<DocumentTextIcon/>}>الاستخراج</TabButton>
                            <TabButton isActive={view === 'comprehension'} onClick={() => setView('comprehension')} icon={<BookOpenIcon/>}>فهم النص</TabButton>
                            <TabButton isActive={view === 'database'} onClick={() => setView('database')} icon={<DatabaseIcon/>}>قاعدة البيانات</TabButton>
                            <TabButton isActive={view === 'testing'} onClick={() => setView('testing')} icon={<TestTubeIcon/>}>الاختبار</TabButton>
                            <TabButton isActive={view === 'chat'} onClick={() => setView('chat')} icon={<ChatIcon />}>الدردشة</TabButton>
                            <TabButton isActive={view === 'training'} onClick={() => setView('training')} icon={<BrainIcon />}>بيانات التدريب</TabButton>
                            <TabButton isActive={view === 'knowledge'} onClick={() => setView('knowledge')} icon={<AcademicCapIcon />}>المعرفة</TabButton>
                        </div>
                    </nav>
                )}
            </header>
            
            <main className="flex-1 p-4 w-full max-w-5xl mx-auto">
                {isSimpleUserView ? (
                    <SimpleUserView
                        handleFunctionCall={handleFunctionCall}
                        handleError={handleError}
                        handleSuccess={handleSuccess}
                        conversationFeedback={conversationFeedback}
                        addConversationFeedback={addConversationFeedback}
                        database={database}
                        customInstructions={customInstructions}
                        replacementMap={replacementMap}
                        knowledgeBase={knowledgeBase}
                        userStyleProfile={userStyleProfile}
                        handleAnalyzeConversation={handleAnalyzeConversation}
                        loadingStates={loadingStates}
                        setLoading={setLoading}
                        isLiveSessionActive={isLiveSessionActive}
                        toggleLiveSession={toggleLiveSession}
                        liveTranscript={liveTranscript}
                        useDatabaseForLive={useDatabaseForLive}
                        setUseDatabaseForLive={setUseDatabaseForLive}
                        useWebSearchForLive={useWebSearchForLive}
                        setUseWebSearchForLive={setUseWebSearchForLive}
                        useKnowledgeForLive={useKnowledgeForLive}
                        setUseKnowledgeForLive={setUseKnowledgeForLive}
                    />
                ) : (
                <>
                 {view === 'extractor' && 
                    <ExtractorView 
                        setLoading={setLoading} 
                        loadingStates={loadingStates} 
                        handleError={handleError} 
                        handleSuccess={handleSuccess} 
                        addWordToPending={addWordToPending}
                        addMultipleWordsToPending={addMultipleWordsToPending}
                        database={database}
                        pendingWords={pendingWords}
                        approveWord={approveWord}
                        rejectWord={rejectWord}
                        updatePendingWord={updatePendingWord}
                        pendingExclusions={pendingExclusions}
                        setPendingExclusions={setPendingExclusions}
                        replacementMap={replacementMap}
                        setReplacementMap={setReplacementMap}
                    /> 
                 }
                 {view === 'comprehension' &&
                    <ComprehensionTab
                        setLoading={setLoading}
                        loadingStates={loadingStates}
                        handleError={handleError}
                        handleSuccess={handleSuccess}
                        addWordToPending={addWordToPending}
                        addMultipleWordsToPending={addMultipleWordsToPending}
                        database={database}
                        pendingWords={pendingWords}
                        addConversationFeedback={addConversationFeedback}
                    />
                 }
                 {view === 'database' &&
                    <DatabaseView
                        database={database}
                        setDatabase={setDatabase}
                        setLoading={setLoading}
                        loadingStates={loadingStates}
                        handleError={handleError}
                        handleSuccess={handleSuccess}
                        conversationFeedback={conversationFeedback}
                        setConversationFeedback={setConversationFeedback}
                        customInstructions={customInstructions}
                        setCustomInstructions={setCustomInstructions}
                        replacementMap={replacementMap}
                        setReplacementMap={setReplacementMap}
                        userStyleProfile={userStyleProfile}
                        setUserStyleProfile={setUserStyleProfile}
                    />
                }
                {view === 'testing' &&
                    <TestingTab
                        database={database}
                        setLoading={setLoading}
                        loadingStates={loadingStates}
                        handleError={handleError}
                        handleSuccess={handleSuccess}
                        isLiveSessionActive={isLiveSessionActive}
                        toggleLiveSession={toggleLiveSession}
                        liveTranscript={liveTranscript}
                        useDatabaseForLive={useDatabaseForLive}
                        setUseDatabaseForLive={setUseDatabaseForLive}
                        useWebSearchForLive={useWebSearchForLive}
                        setUseWebSearchForLive={setUseWebSearchForLive}
                        customInstructions={customInstructions}
                        knowledgeBase={knowledgeBase}
                        useKnowledgeForLive={useKnowledgeForLive}
                        setUseKnowledgeForLive={setUseKnowledgeForLive}
                        userStyleProfile={userStyleProfile}
                    />
                }
                 {view === 'chat' &&
                    <ChatTab
                       handleFunctionCall={handleFunctionCall}
                       handleError={handleError}
                       conversationFeedback={conversationFeedback}
                       addConversationFeedback={addConversationFeedback}
                       database={database}
                       customInstructions={customInstructions}
                       replacementMap={replacementMap}
                       knowledgeBase={knowledgeBase}
                       userStyleProfile={userStyleProfile}
                       handleAnalyzeConversation={handleAnalyzeConversation}
                       loadingStates={loadingStates}
                    />
                }
                {view === 'training' &&
                    <TrainingDataTab
                       feedbackData={conversationFeedback}
                       deleteFeedback={deleteConversationFeedback}
                       updateFeedback={updateConversationFeedback}
                       addConversationFeedback={addConversationFeedback}
                    />
                }
                {view === 'knowledge' &&
                    <KnowledgeTab
                        knowledgeBase={knowledgeBase}
                        setKnowledgeBase={setKnowledgeBase}
                        handleError={handleError}
                        handleSuccess={handleSuccess}
                    />
                }
                </>
                )}
            </main>
            
            {!isSimpleUserView && callStatus === 'idle' && (
                <button
                    onClick={() => toggleLiveSession({ script: null, customInstructions, useKnowledge: useKnowledgeForLive, knowledgeBase, userStyleProfile })}
                    className="fixed bottom-6 left-6 bg-blue-500 hover:bg-blue-600 text-white rounded-full p-4 shadow-lg z-20 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
                    aria-label="Start Live Audio Session"
                >
                    <PhoneIcon />
                </button>
            )}
        </div>
    );
};

export default App;