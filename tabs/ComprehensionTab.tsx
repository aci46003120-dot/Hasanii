import React, { FC, useState, useMemo, useRef } from 'react';
import { WordEntry, AnalyzedWord, ConversationFeedback, ChatMessage } from '../types';
import * as geminiService from '../services/geminiService';
import { Card, Button, Loader, PageLoader } from '../components/UI';
import { CheckIcon, UploadIcon, BrainIcon } from '../components/Icons';
import { generateUUID } from '../utils';

interface ComprehensionTabProps {
    setLoading: (key: string, value: boolean) => void;
    loadingStates: Record<string, boolean>;
    handleError: (msg: string) => void;
    handleSuccess: (msg: string) => void;
    addWordToPending: (word: Partial<WordEntry>) => void;
    addMultipleWordsToPending: (words: Partial<WordEntry>[]) => void;
    database: WordEntry[];
    pendingWords: Partial<WordEntry>[];
    addConversationFeedback: (feedback: Omit<ConversationFeedback, 'id' | 'timestamp'>) => void;
}

interface QnAResult {
    id: string;
    question: string;
    answer: string;
}

// Component to display text with highlights
const AnalyzedTextView: FC<{ text: string; results: AnalyzedWord[] }> = ({ text, results }) => {
    const createHighlightedText = () => {
        if (!results.length) {
            return text;
        }

        const uniqueWords: string[] = Array.from(new Set(results.map((r: AnalyzedWord) => r.hassaniya)));
        
        const escapedWords = uniqueWords.map(w => w.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'));
        
        if (escapedWords.length === 0) {
            return text;
        }

        const regex = new RegExp(`(${escapedWords.join('|')})`, 'g');
        const parts = text.split(regex);

        return parts.map((part, index) => {
            const matchedResult = results.find(r => r.hassaniya === part);
            if (matchedResult) {
                return (
                    <span
                        key={index}
                        className="bg-indigo-100 dark:bg-indigo-900/50 p-1 rounded-md mx-px cursor-pointer transition-colors hover:bg-indigo-200 dark:hover:bg-indigo-800/70"
                        title={`المعنى: ${matchedResult.arabic}`}
                    >
                        {part}
                    </span>
                );
            }
            return <React.Fragment key={index}>{part}</React.Fragment>;
        });
    };

    return (
        <Card>
            <h3 className="text-lg font-bold mb-3">النص المُحلل:</h3>
            <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg text-md">
                <p className="whitespace-pre-wrap leading-relaxed">
                    {createHighlightedText()}
                </p>
            </div>
        </Card>
    );
};

// New component for table view of results
const AnalysisResultTable: FC<{
    results: AnalyzedWord[];
    onUpdateMeaning: (index: number, newMeaning: string) => void;
    onAddToReview: (word: Partial<WordEntry>) => void;
    dbWordSet: Set<string>;
    pendingWordSet: Set<string>;
}> = ({ results, onUpdateMeaning, onAddToReview, dbWordSet, pendingWordSet }) => {
    return (
        <Card>
            <h3 className="text-lg font-bold mb-3">تفاصيل الكلمات المكتشفة:</h3>
            <div className="overflow-x-auto">
                <table className="w-full text-right">
                    <thead>
                        <tr className="border-b dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400">
                            <th className="p-2 font-medium text-start w-[25%]">الكلمة الحسانية</th>
                            <th className="p-2 font-medium text-start w-[25%]">المعنى المقترح</th>
                            <th className="p-2 font-medium text-start w-[40%]">السياق</th>
                            <th className="p-2 font-medium text-center w-[10%]">الإجراء</th>
                        </tr>
                    </thead>
                    <tbody>
                        {results.map((result, index) => {
                            const hassaniyaLower = result.hassaniya.toLowerCase();
                            const isInDatabase = dbWordSet.has(hassaniyaLower);
                            const isPending = pendingWordSet.has(hassaniyaLower);

                            return (
                                <tr key={`${result.hassaniya}-${index}`} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 text-sm">
                                    <td className="p-2 align-top font-semibold text-indigo-600 dark:text-indigo-400">
                                        {result.hassaniya}
                                    </td>
                                    <td className="p-2 align-top">
                                        {isInDatabase ? (
                                            <p className="p-1.5">{result.arabic}</p>
                                        ) : (
                                            <input
                                                type="text"
                                                value={result.arabic}
                                                onChange={(e) => onUpdateMeaning(index, e.target.value)}
                                                disabled={isPending}
                                                className="w-full p-1.5 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600 focus:ring-1 focus:ring-indigo-500 text-sm disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:cursor-not-allowed"
                                                aria-label={`معنى ${result.hassaniya}`}
                                            />
                                        )}
                                    </td>
                                    <td className="p-2 align-top text-gray-500 dark:text-gray-400 italic">
                                        "{result.context}"
                                    </td>
                                    <td className="p-2 align-top text-center">
                                        {isInDatabase ? (
                                            <span className="flex items-center justify-center text-xs font-medium text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/50 px-2 py-1 rounded-full">
                                                <CheckIcon />
                                                <span className="mr-1 hidden sm:inline">موجودة</span>
                                            </span>
                                        ) : isPending ? (
                                            <span className="flex items-center justify-center text-xs font-medium text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/50 px-2 py-1 rounded-full">
                                                <CheckIcon />
                                                <span className="mr-1 hidden sm:inline">للمراجعة</span>
                                            </span>
                                        ) : (
                                            <Button
                                                onClick={() => onAddToReview({ hassaniya: result.hassaniya, arabic: result.arabic, notes: `From context: "${result.context}"` })}
                                                variant="secondary"
                                                className="text-xs py-1 px-2 w-full"
                                            >
                                                + إضافة
                                            </Button>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </Card>
    );
};

const QnAResultsTable: FC<{
    results: QnAResult[];
    onAddAsTrainingData: (qna: QnAResult) => void;
}> = ({ results, onAddAsTrainingData }) => (
    <Card>
        <h3 className="text-lg font-bold mb-3">الأسئلة والأجوبة المقترحة</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            قام النموذج بتوليد هذه الأسئلة والأجوبة بناءً على النص. يمكنك إضافتها كأمثلة تدريبية لتحسين قدرات الحوار لدى النموذج.
        </p>
        <div className="overflow-x-auto">
            <table className="w-full text-right">
                <thead>
                    <tr className="border-b dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400">
                        <th className="p-2 font-medium text-start w-[45%]">السؤال المتوقع</th>
                        <th className="p-2 font-medium text-start w-[45%]">الإجابة المقترحة</th>
                        <th className="p-2 font-medium text-center w-[10%]">الإجراء</th>
                    </tr>
                </thead>
                <tbody>
                    {results.map((result) => (
                        <tr key={result.id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 text-sm">
                            <td className="p-2 align-top">{result.question}</td>
                            <td className="p-2 align-top font-mono text-xs">{result.answer}</td>
                            <td className="p-2 align-top text-center">
                                <Button
                                    onClick={() => onAddAsTrainingData(result)}
                                    variant="secondary"
                                    className="text-xs py-1 px-2 w-full"
                                >
                                    + تدريب
                                </Button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </Card>
);


const ComprehensionTab: FC<ComprehensionTabProps> = ({
    setLoading,
    loadingStates,
    handleError,
    handleSuccess,
    addWordToPending,
    addMultipleWordsToPending,
    database,
    pendingWords,
    addConversationFeedback
}) => {
    const [text, setText] = useState('');
    const [analyzedText, setAnalyzedText] = useState<string | null>(null);
    const [analysisResults, setAnalysisResults] = useState<AnalyzedWord[]>([]);
    const [displayResults, setDisplayResults] = useState<AnalyzedWord[]>([]);
    const [qnaResults, setQnaResults] = useState<QnAResult[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    
    const dbWordSet = useMemo(() => new Set(database.map(w => w.hassaniya.toLowerCase())), [database]);
    const pendingWordSet = useMemo(() => new Set(pendingWords.map(w => w.hassaniya?.toLowerCase() || '')), [pendingWords]);
    
    const newWordsToAdd = useMemo(() => {
        return displayResults.filter(result => {
            const key = result.hassaniya.toLowerCase();
            return !dbWordSet.has(key) && !pendingWordSet.has(key);
        });
    }, [displayResults, dbWordSet, pendingWordSet]);

    const handleAnalyze = async () => {
        if (!text.trim()) {
            handleError("الرجاء إدخال نص لتحليله.");
            return;
        }
        setLoading('comprehend', true);
        setAnalyzedText(text);
        setAnalysisResults([]);
        setDisplayResults([]);
        setQnaResults([]);
        try {
            const results = await geminiService.comprehendText(text, database);
            setAnalysisResults(results);

            const uniqueResultsMap = new Map<string, AnalyzedWord>();
            results.forEach(r => {
                if(!uniqueResultsMap.has(r.hassaniya.toLowerCase())) {
                    uniqueResultsMap.set(r.hassaniya.toLowerCase(), r);
                }
            });
            const uniqueResults = Array.from(uniqueResultsMap.values());
            setDisplayResults(uniqueResults);


            if (uniqueResults.length === 0) {
                handleSuccess("لم يتم العثور على كلمات حسانية معروفة أو محتملة في النص.");
            } else {
                handleSuccess(`تم العثور على ${uniqueResults.length} كلمة حسانية فريدة.`);
            }
        } catch (err: any) {
            handleError(err.message || "حدث خطأ أثناء تحليل النص.");
            setAnalyzedText(null); // Clear analyzed text on error
        } finally {
            setLoading('comprehend', false);
        }
    };
    
    const handleDisplayResultMeaningChange = (index: number, newArabic: string) => {
        setDisplayResults(prev => {
            const newResults = [...prev];
            newResults[index] = { ...newResults[index], arabic: newArabic };
            return newResults;
        });
    };

    const handleFileRead = (content: string) => {
        setText(content);
        setAnalysisResults([]);
        setDisplayResults([]);
        setAnalyzedText(null);
        setQnaResults([]);
        handleSuccess("تم تحميل محتوى الملف بنجاح. اضغط على 'حلل النص' للبدء.");
    };
    
    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setLoading('file-read', true);
        const reader = new FileReader();
        reader.onload = (e) => {
            const fileContent = e.target?.result as string;
            handleFileRead(fileContent);
            setLoading('file-read', false);
        };
        reader.onerror = () => {
            handleError("خطأ في قراءة الملف.");
            setLoading('file-read', false);
        };
        reader.readAsText(file, 'UTF-8');
        
        if (event.target) {
            event.target.value = "";
        }
    };
    
    const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newText = e.target.value;
        setText(newText);
        if (newText.trim() === '') {
            setAnalysisResults([]);
            setDisplayResults([]);
            setAnalyzedText(null);
            setQnaResults([]);
        }
    }
    
    const handleAddAllToReview = () => {
        if (newWordsToAdd.length > 0) {
            const wordsForPending = newWordsToAdd.map(result => ({
                hassaniya: result.hassaniya,
                arabic: result.arabic,
                notes: `From context: "${result.context}"`
            }));
            addMultipleWordsToPending(wordsForPending);
        }
    };

    const handleGenerateQnA = async () => {
        if (!analyzedText) return;
        setLoading('qna', true);
        try {
            const results = await geminiService.generateQnAFromText(analyzedText, database);
            setQnaResults(results.map(r => ({ ...r, id: generateUUID() })));
            if (results.length > 0) {
                handleSuccess(`تم توليد ${results.length} سؤال وجواب بنجاح.`);
            } else {
                handleSuccess("لم يتمكن النموذج من توليد أسئلة وأجوبة من هذا النص.");
            }
        } catch (err: any) {
            handleError(err.message || "فشل توليد الأسئلة والأجوبة.");
        } finally {
            setLoading('qna', false);
        }
    };
    
    const handleAddAsTrainingData = (qna: QnAResult) => {
        const userMessage: ChatMessage = { id: generateUUID(), role: 'user', text: qna.question };
        const modelMessage: ChatMessage = { id: generateUUID(), role: 'model', text: qna.answer, rating: 'good' };

        addConversationFeedback({
            ratedMessageId: modelMessage.id,
            context: [userMessage, modelMessage],
            rating: 'good',
            notes: 'تم إنشاؤه من أداة توليد الأسئلة والأجوبة',
        });

        setQnaResults(prev => prev.filter(item => item.id !== qna.id));
        handleSuccess("تمت إضافة السؤال والجواب كبيانات تدريب.");
    };

    return (
        <div className="space-y-4">
            <Card>
                <h2 className="text-xl font-bold mb-2">فهم وتحليل النص</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    ألصق نصًا باللهجة الحسانية هنا، أو قم برفع ملف نصي. سيقوم النموذج بتحليله وتحديد الكلمات المعروفة بناءً على قاعدة بياناتك، مع إبرازها في النص.
                </p>
                <textarea
                    value={text}
                    onChange={handleTextChange}
                    rows={8}
                    className="w-full p-2 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600 focus:ring-1 focus:ring-indigo-500"
                    placeholder="أدخل النص الطويل هنا..."
                />
                 <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".txt,text/plain" className="hidden" />
                <div className="flex flex-col gap-2 mt-2">
                    <div className="flex items-center gap-2">
                        <Button onClick={handleAnalyze} disabled={loadingStates['comprehend'] || !text.trim()} className="flex-grow">
                            {loadingStates['comprehend'] ? <Loader /> : 'حلل وافهم النص'}
                        </Button>
                        <Button onClick={() => fileInputRef.current?.click()} variant="secondary" disabled={loadingStates['file-read']} className="flex-grow-0">
                            {loadingStates['file-read'] ? <Loader /> : <UploadIcon />}
                            <span className="mr-2">رفع ملف نصي</span>
                        </Button>
                    </div>
                     {analyzedText && !loadingStates['comprehend'] && (
                        <Button onClick={handleGenerateQnA} disabled={loadingStates['qna']} variant="purple" className="w-full">
                            {loadingStates['qna'] ? <Loader /> : <BrainIcon className="w-5 h-5" />}
                            <span className="mr-2">توليد أسئلة وأجوبة من النص</span>
                        </Button>
                    )}
                </div>
            </Card>

            {loadingStates['comprehend'] && <PageLoader />}

            {analyzedText && !loadingStates['comprehend'] && (
                <AnalyzedTextView text={analyzedText} results={analysisResults} />
            )}
            
            {loadingStates['qna'] && <PageLoader />}
            
            {!loadingStates['qna'] && qnaResults.length > 0 && (
                <QnAResultsTable
                    results={qnaResults}
                    onAddAsTrainingData={handleAddAsTrainingData}
                />
            )}

            {analysisResults.length > 0 && newWordsToAdd.length > 0 && !loadingStates['comprehend'] && (
                <Card>
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
                        <p className="text-sm text-gray-600 dark:text-gray-300">
                            تم العثور على <span className="font-bold text-indigo-500">{newWordsToAdd.length}</span> كلمة جديدة.
                        </p>
                        <Button onClick={handleAddAllToReview} variant="green" className="w-full sm:w-auto">
                            + إضافة كل الكلمات الجديدة للمراجعة
                        </Button>
                    </div>
                </Card>
            )}

            {displayResults.length > 0 && !loadingStates['comprehend'] && (
                 <AnalysisResultTable
                    results={displayResults}
                    onUpdateMeaning={handleDisplayResultMeaningChange}
                    onAddToReview={addWordToPending}
                    dbWordSet={dbWordSet}
                    pendingWordSet={pendingWordSet}
                />
            )}
        </div>
    );
};

export default ComprehensionTab;