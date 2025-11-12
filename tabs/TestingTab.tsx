import React, { useState, FC, useRef, ChangeEvent } from 'react';
import { WordEntry, KnowledgeDocument } from '../types';
import * as geminiService from '../services/geminiService';
import { Card, Button, Loader, PageLoader, ToggleButton } from '../components/UI';
import { MicIcon, PlayIcon, UploadIcon, XIcon, DatabaseIcon, GlobeIcon, AcademicCapIcon, DownloadIcon } from '../components/Icons';

interface TranscriptEntry {
    speaker: 'user' | 'model';
    text: string;
}

type TestingTabVariant = 'full' | 'simple';

interface TestingTabProps {
    database: WordEntry[],
    setLoading: (key: string, value: boolean) => void,
    loadingStates: Record<string, boolean>,
    handleError: (msg: string) => void,
    handleSuccess: (msg: string) => void,
    isLiveSessionActive: boolean;
    toggleLiveSession: (options: { script: string | null, customInstructions: string, useKnowledge: boolean, knowledgeBase: KnowledgeDocument[], userStyleProfile: string }) => void;
    liveTranscript: TranscriptEntry[];
    useDatabaseForLive: boolean;
    setUseDatabaseForLive: React.Dispatch<React.SetStateAction<boolean>>;
    useWebSearchForLive: boolean;
    setUseWebSearchForLive: React.Dispatch<React.SetStateAction<boolean>>;
    customInstructions: string;
    knowledgeBase: KnowledgeDocument[];
    useKnowledgeForLive: boolean;
    setUseKnowledgeForLive: React.Dispatch<React.SetStateAction<boolean>>;
    userStyleProfile: string;
    downloadCallAudio?: () => Promise<void>;
    hasRecordedAudio?: boolean;
    variant?: TestingTabVariant;
}

const TestingTab: FC<TestingTabProps> = ({ 
    database, setLoading, loadingStates, handleError, handleSuccess, 
    isLiveSessionActive, toggleLiveSession, liveTranscript,
    useDatabaseForLive, setUseDatabaseForLive, useWebSearchForLive, setUseWebSearchForLive,
    customInstructions, knowledgeBase, useKnowledgeForLive, setUseKnowledgeForLive,
    userStyleProfile,
    downloadCallAudio,
    hasRecordedAudio = false,
    variant = 'full'
}) => {
    const [sentence, setSentence] = useState('');
    const [audioB64, setAudioB64] = useState<string | null>(null);
    const [scriptContent, setScriptContent] = useState<string | null>(null);
    const [scriptFileName, setScriptFileName] = useState<string | null>(null);
    const scriptFileInputRef = useRef<HTMLInputElement>(null);
    const isSimple = variant === 'simple';

    const playAudio = async () => {
        if (!audioB64) return;
        try {
            const outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            const audioBuffer = await geminiService.decodeAudioData(
                geminiService.decode(audioB64),
                outputAudioContext,
                24000,
                1,
            );
            const source = outputAudioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(outputAudioContext.destination);
            source.start();
        } catch (error) {
            console.error("Failed to play audio:", error);
            handleError("فشل في تشغيل الصوت.");
        }
    };

    const handleScriptUpload = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const content = e.target?.result as string;
                let scriptText = '';
                const fileNameLower = file.name.toLowerCase();

                if (fileNameLower.endsWith('.csv')) {
                    const rows = content.split(/\r?\n/).filter(row => row.trim() !== '');
                    if (rows.length < 2) {
                        throw new Error("ملف CSV يجب أن يحتوي على رأس وبيانات.");
                    }
                    // Skip header
                    scriptText = rows.slice(1).map(row => {
                        const parts = row.split(',');
                        const speaker = parts[0]?.trim();
                        const dialogue = parts.slice(1).join(',').trim().replace(/^"|"$/g, '');
                        
                        if (speaker && dialogue) {
                            return `${speaker}: ${dialogue}`;
                        }
                        return '';
                    }).filter(Boolean).join('\n');
                } else if (fileNameLower.endsWith('.json')) {
                    const parsedJson = JSON.parse(content);
                    let data: any[] = [];

                    if (Array.isArray(parsedJson)) {
                        data = parsedJson;
                    } else if (typeof parsedJson === 'object' && parsedJson !== null) {
                        const messagesKey = ['messages', 'conversation', 'chat', 'log'].find(key => Array.isArray(parsedJson[key]));
                        if (messagesKey) {
                            data = parsedJson[messagesKey];
                        }
                    }

                    if (data.length > 0) {
                        const firstItem = data[0];
                        if (typeof firstItem === 'object' && firstItem !== null) {
                            const speakerKey = ['author', 'speaker', 'role', 'name'].find(key => key in firstItem);
                            const messageKey = ['message', 'dialogue', 'text', 'content'].find(key => key in firstItem);

                            if (speakerKey && messageKey) {
                                scriptText = data.map(item => {
                                    if (typeof item !== 'object' || item === null) return '';
                                    const speaker = item[speakerKey];
                                    const dialogue = item[messageKey];
                                    if (typeof speaker === 'string' && typeof dialogue === 'string' && dialogue.trim()) {
                                        return `${speaker}: ${dialogue}`;
                                    }
                                    return '';
                                }).filter(Boolean).join('\n');
                            } else {
                                throw new Error("ملف JSON غير معروف. يجب أن تحتوي الكائنات على مفاتيح للمتحدث والرسالة (مثل author/message).");
                            }
                        } else {
                             throw new Error("تنسيق البيانات في مصفوفة JSON غير مدعوم.");
                        }
                    } else {
                         throw new Error("ملف JSON يجب أن يحتوي على مصفوفة غير فارغة من الرسائل.");
                    }
                } else { // Default to text
                    scriptText = content;
                }

                if (!scriptText.trim()) {
                    throw new Error("فشل استخراج النص من الملف. قد يكون المحتوى فارغًا أو بتنسيق غير صالح.");
                }

                setScriptContent(scriptText);
                setScriptFileName(file.name);
                handleSuccess(`تم تحميل النص "${file.name}".`);

            } catch (error: any) {
                const errorMessage = error.message || `خطأ في معالجة الملف ${file.name}.`;
                handleError(errorMessage);
                console.error("Script upload error:", error);
                setScriptContent(null);
                setScriptFileName(null);
            }
        };
        reader.onerror = () => {
            handleError("خطأ في قراءة الملف.");
        };
        reader.readAsText(file, 'UTF-8');
        
        if (event.target) {
            event.target.value = "";
        }
    };

    const clearScript = () => {
        setScriptContent(null);
        setScriptFileName(null);
    };

    const handleGenerateAudioTest = async () => {
        if (database.length < 2) {
            handleError("يجب أن تحتوي قاعدة البيانات على كلمتين على الأقل لإنشاء اختبار.");
            return;
        }
        setLoading('audio', true);
        setSentence('');
        setAudioB64(null);
        try {
            const randomWords = [...database].sort(() => 0.5 - Math.random()).slice(0, 2);
            const generatedSentence = await geminiService.generateSentenceForAudioTest(randomWords);
            setSentence(generatedSentence);
            const newAudioB64 = await geminiService.generateAudio(generatedSentence);
            setAudioB64(newAudioB64);
        } catch (err: any) {
            handleError(err.message || "فشل توليد الاختبار الصوتي.");
        } finally {
            setLoading('audio', false);
        }
    };
    
    return (
        <div className="space-y-4">
             <Card>
                <h2 className="text-xl font-bold mb-2">المحادثة الصوتية المباشرة</h2>
                <p className="mb-4 text-sm text-gray-600 dark:text-gray-300">
                    تحدث بحرية مع الذكاء الاصطناعي باللهجة الحسانية.{!isSimple && ' يمكنك أيضًا تحميل نص لتوجيه الحوار أو تخصيص مصادر المعرفة المستخدمة.'}
                </p>
                
                {!isSimple && (
                    <div className="flex items-center flex-wrap gap-2 mb-3 border-b dark:border-gray-700 pb-3">
                        <span className="text-xs font-semibold text-gray-500">مصادر المعلومات للمكالمة:</span>
                        <ToggleButton isEnabled={useDatabaseForLive} onToggle={() => setUseDatabaseForLive(v => !v)} icon={<DatabaseIcon className="h-4 w-4" />}>
                            استخدام قاعدة بياناتي
                        </ToggleButton>
                        <ToggleButton isEnabled={useWebSearchForLive} onToggle={() => setUseWebSearchForLive(v => !v)} icon={<GlobeIcon className="h-4 w-4" />}>
                            استخدام بحث جوجل
                        </ToggleButton>
                        <ToggleButton isEnabled={useKnowledgeForLive} onToggle={() => setUseKnowledgeForLive(v => !v)} icon={<AcademicCapIcon />} disabled={knowledgeBase.length === 0}>
                            استخدام المعرفة ({knowledgeBase.length})
                        </ToggleButton>
                    </div>
                )}

                {!isSimple && !isLiveSessionActive && (
                    <div className="mb-4">
                        <input type="file" ref={scriptFileInputRef} onChange={handleScriptUpload} accept=".txt,text/plain,.csv,text/csv,.json,application/json" className="hidden" />
                        {!scriptContent ? (
                            <Button onClick={() => scriptFileInputRef.current?.click()} variant="secondary">
                                <UploadIcon /> تحميل نص للحوار (txt, csv, json)
                            </Button>
                        ) : (
                            <div className="flex items-center justify-between p-2 bg-gray-100 dark:bg-gray-700 rounded-md">
                                <span className="text-sm font-medium truncate">{scriptFileName}</span>
                                <button onClick={clearScript} className="p-1 text-gray-500 hover:text-red-500"><XIcon /></button>
                            </div>
                        )}
                    </div>
                )}

                <div className="flex flex-col items-center space-y-3">
                     <button
                        onClick={() => toggleLiveSession({ script: scriptContent, customInstructions, useKnowledge: useKnowledgeForLive, knowledgeBase, userStyleProfile })}
                        className="w-20 h-20 bg-gray-100 dark:bg-gray-700 rounded-full shadow-lg flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
                        aria-label={isLiveSessionActive ? "Stop Live Session" : "Start Live Session"}
                        disabled={loadingStates['live-session']}
                    >
                        {loadingStates['live-session'] ? <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div> : <MicIcon active={isLiveSessionActive} />}
                    </button>
                    <p className={`text-sm font-semibold ${isLiveSessionActive ? 'text-red-500 animate-pulse' : 'text-gray-500'}`}>
                        {loadingStates['live-session'] ? '...جاري البدء' : (isLiveSessionActive ? 'المكالمة جارية' : 'اضغط للبدء')}
                    </p>
                </div>
                
                {(isLiveSessionActive || liveTranscript.length > 0) && (
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-md font-semibold">نص المكالمة</h3>
                            {downloadCallAudio && !isLiveSessionActive && hasRecordedAudio && (
                                <Button 
                                    onClick={downloadCallAudio} 
                                    variant="secondary" 
                                    disabled={loadingStates['download-audio']}
                                    className="gap-2"
                                >
                                    {loadingStates['download-audio'] ? <Loader /> : <DownloadIcon />}
                                    <span>تنزيل صوت المكالمة</span>
                                </Button>
                            )}
                        </div>
                        <div className="space-y-3 max-h-60 overflow-y-auto p-2 bg-gray-50 dark:bg-gray-900 rounded-md">
                            {liveTranscript.map((entry, index) => (
                                <div key={index} className={`flex ${entry.speaker === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-xs md:max-w-md lg:max-w-lg px-3 py-2 rounded-lg ${entry.speaker === 'user' ? 'bg-indigo-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100'}`}>
                                        <p className="text-sm">{entry.text}</p>
                                    </div>
                                </div>
                            ))}
                             {isLiveSessionActive && <div className="animate-pulse text-center text-xs text-gray-400">يستمع...</div>}
                        </div>
                    </div>
                )}
             </Card>

            {!isSimple && (
            <Card>
                <h2 className="text-xl font-bold mb-2">اختبار صوتي</h2>
                <p className="mb-4 text-sm text-gray-600 dark:text-gray-300">أنشئ جملة صوتية عشوائية باستخدام كلمات من قاعدة بياناتك للتحقق من النطق والسياق.</p>
                <Button onClick={handleGenerateAudioTest} disabled={loadingStates['audio']}>
                    {loadingStates['audio'] ? <Loader/> : 'أنشئ اختبارًا صوتيًا جديدًا'}
                </Button>
                {(loadingStates['audio'] && !sentence) && <PageLoader />}
                {sentence && (
                    <div className="mt-4 space-y-3">
                        <p className="font-semibold text-sm">الجملة المولدة:</p>
                        <p className="p-3 bg-gray-100 dark:bg-gray-700 rounded-md text-sm">{sentence}</p>
                        {loadingStates['audio'] && !audioB64 && <p className="text-sm text-center">جاري توليد الصوت...</p>}
                        {audioB64 && (
                            <Button onClick={playAudio} variant="secondary" className="gap-2">
                                <PlayIcon />
                                <span>تشغيل الصوت</span>
                            </Button>
                        )}
                    </div>
                )}
            </Card>
            )}
        </div>
    );
}

export default TestingTab;