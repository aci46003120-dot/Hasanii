import React, { useState, useRef, ChangeEvent, FC, useMemo, useEffect } from 'react';
import { WordEntry, AnalysisMode, PartOfSpeech, PARTS_OF_SPEECH_OPTIONS, PendingExclusion, ReplacementRule } from '../types';
import * as geminiService from '../services/geminiService';
import { Card, Button, Loader } from '../components/UI';
import { UploadIcon, InfoIcon, DatabaseIcon, CheckIcon, TrashIcon } from '../components/Icons';
import { generateUUID } from '../utils';

// --- Exclusion Review Components ---

interface ExclusionReviewItemProps {
    exclusion: PendingExclusion;
    onApprove: (id: string) => void;
    onReject: (id: string) => void;
}

const ExclusionReviewItem: FC<ExclusionReviewItemProps> = ({ exclusion, onApprove, onReject }) => {
    return (
        <tr className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 text-sm">
            <td className="p-2 align-middle">
                <span className="font-semibold text-red-500">{exclusion.incorrectWord}</span>
            </td>
            <td className="p-2 align-middle">
                <span className="font-semibold text-green-500">{exclusion.suggestedReplacement}</span>
            </td>
            <td className="p-2 text-gray-500 align-middle">
                {new Date(exclusion.dateSuggested).toLocaleDateString('en-CA')}
            </td>
            <td className="p-2 align-middle">
                <div className="flex items-center justify-center gap-2 h-full">
                    <button onClick={() => onApprove(exclusion.id)} className="text-green-500 hover:text-green-700 p-1" aria-label="Approve Exclusion"><CheckIcon /></button>
                    <button onClick={() => onReject(exclusion.id)} className="text-red-500 hover:text-red-700 p-1" aria-label="Reject Exclusion"><TrashIcon /></button>
                </div>
            </td>
        </tr>
    );
};

interface ExclusionReviewListProps {
    pendingExclusions: PendingExclusion[];
    approveExclusion: (id: string) => void;
    rejectExclusion: (id: string) => void;
}

const ExclusionReviewList: FC<ExclusionReviewListProps> = ({ pendingExclusions, approveExclusion, rejectExclusion }) => {
    if (pendingExclusions.length === 0) {
        return null;
    }

    return (
        <Card>
            <h3 className="text-lg font-bold mb-4">اقتراحات الاستبعاد ({pendingExclusions.length})</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                هذه الكلمات تم اقتراحها من قبل الذكاء الاصطناعي أثناء تصحيحه للمستخدم. قم بالموافقة لإضافتها إلى قائمة الاستبدالات/الاستبعادات الدائمة.
            </p>
            <div className="overflow-x-auto">
                <table className="w-full text-right">
                    <thead>
                        <tr className="border-b dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400">
                            <th className="p-2 font-medium text-start">الكلمة غير الصحيحة</th>
                            <th className="p-2 font-medium text-start">البديل المقترح</th>
                            <th className="p-2 font-medium text-start">تاريخ الاقتراح</th>
                            <th className="p-2 font-medium text-center">الإجراءات</th>
                        </tr>
                    </thead>
                    <tbody>
                        {pendingExclusions.map(ex => (
                            <ExclusionReviewItem 
                                key={ex.id}
                                exclusion={ex}
                                onApprove={approveExclusion}
                                onReject={rejectExclusion}
                            />
                        ))}
                    </tbody>
                </table>
            </div>
        </Card>
    );
};


// --- Word Review List Components ---

interface ReviewItemProps {
    word: Partial<WordEntry>;
    isInDatabase: boolean;
    isPendingDuplicate: boolean;
    onUpdate: (word: Partial<WordEntry>) => void;
    onApprove: (id: string) => void;
    onReject: (id: string) => void;
}

const ReviewItem: FC<ReviewItemProps> = ({ word, isInDatabase, isPendingDuplicate, onUpdate, onApprove, onReject }) => {
    const [editedWord, setEditedWord] = useState(word);

    useEffect(() => {
        setEditedWord(word);
    }, [word]);

    const handleFieldChange = (field: keyof Partial<WordEntry>, value: string) => {
        setEditedWord(prev => ({ ...prev, [field]: value }));
    };

    const handleBlur = (field: keyof Partial<WordEntry>) => {
        if (editedWord[field] !== word[field]) {
            onUpdate(editedWord);
        }
    };
    
    const handleSelectChange = (value: string) => {
        const updated = { ...editedWord, partOfSpeech: value as PartOfSpeech };
        setEditedWord(updated);
        onUpdate(updated);
    };

    return (
        <tr className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 text-sm">
            <td className="p-2 align-top">
                <input 
                    type="text" 
                    value={editedWord.hassaniya || ''} 
                    onChange={e => handleFieldChange('hassaniya', e.target.value)}
                    onBlur={() => handleBlur('hassaniya')}
                    className="w-full p-1 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                />
                {isInDatabase && <span className="text-xs text-yellow-500 mt-1 block">موجودة في قاعدة البيانات</span>}
                {isPendingDuplicate && <span className="text-xs text-orange-500 mt-1 block">مكررة في هذه القائمة</span>}
            </td>
            <td className="p-2 align-top">
                 <input 
                    type="text" 
                    value={editedWord.arabic || ''} 
                    onChange={e => handleFieldChange('arabic', e.target.value)}
                    onBlur={() => handleBlur('arabic')}
                    className="w-full p-1 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                />
            </td>
            <td className="p-2 align-top">
                <textarea
                    value={editedWord.notes || ''}
                    onChange={e => handleFieldChange('notes', e.target.value)}
                    onBlur={() => handleBlur('notes')}
                    className="w-full p-1 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 text-xs"
                    rows={2}
                    placeholder="قواعد، أمثلة..."
                />
            </td>
            <td className="p-2 align-top">
                 <select
                    value={editedWord.partOfSpeech}
                    onChange={e => handleSelectChange(e.target.value)}
                    className="w-full p-1 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                 >
                    {PARTS_OF_SPEECH_OPTIONS.map(pos => <option key={pos} value={pos}>{pos}</option>)}
                 </select>
            </td>
            <td className="p-2 text-gray-500 align-top">
                {word.dateAdded ? new Date(word.dateAdded).toLocaleDateString('en-CA') : '-'}
            </td>
            <td className="p-2 align-top">
                <div className="flex items-center justify-center gap-2 h-full">
                    <button onClick={() => onApprove(word.id!)} className="text-green-500 hover:text-green-700 p-1" aria-label="Approve"><CheckIcon /></button>
                    <button onClick={() => onReject(word.id!)} className="text-red-500 hover:text-red-700 p-1" aria-label="Reject"><TrashIcon /></button>
                </div>
            </td>
        </tr>
    );
};


interface ReviewListProps {
    pendingWords: Partial<WordEntry>[];
    database: WordEntry[];
    approveWord: (id: string) => void;
    rejectWord: (id: string) => void;
    updatePendingWord: (word: Partial<WordEntry>) => void;
}

const ReviewList: FC<ReviewListProps> = ({ pendingWords, database, approveWord, rejectWord, updatePendingWord }) => {
    const existingWordsInDB = useMemo(() => new Set(database.map(w => w.hassaniya.toLowerCase())), [database]);

    const pendingWordCounts = useMemo(() => {
        const counts = new Map<string, number>();
        pendingWords.forEach(word => {
            const key = word.hassaniya?.toLowerCase() || '';
            if (key) {
                counts.set(key, (counts.get(key) || 0) + 1);
            }
        });
        return counts;
    }, [pendingWords]);

    if (pendingWords.length === 0) {
        return null;
    }

    return (
        <Card>
            <h3 className="text-lg font-bold mb-4">قائمة مراجعة الكلمات ({pendingWords.length})</h3>
            <div className="overflow-x-auto">
                <table className="w-full text-right">
                    <thead>
                        <tr className="border-b dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400">
                            <th className="p-2 font-medium text-start w-[20%]">الكلمة</th>
                            <th className="p-2 font-medium text-start w-[20%]">المعنى</th>
                            <th className="p-2 font-medium text-start w-[30%]">ملاحظات وقواعد</th>
                            <th className="p-2 font-medium text-center">التصنيف</th>
                            <th className="p-2 font-medium text-start">تاريخ الإضافة</th>
                            <th className="p-2 font-medium text-center">الإجراءات</th>
                        </tr>
                    </thead>
                    <tbody>
                        {pendingWords.map(word => {
                            const wordKey = word.hassaniya?.toLowerCase() || '';
                            return (
                                <ReviewItem 
                                    key={word.id}
                                    word={word}
                                    isInDatabase={existingWordsInDB.has(wordKey)}
                                    isPendingDuplicate={(pendingWordCounts.get(wordKey) || 0) > 1}
                                    onUpdate={updatePendingWord}
                                    onApprove={approveWord}
                                    onReject={rejectWord}
                                />
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </Card>
    );
};


// --- Main Extractor View Component ---

interface ExtractorViewProps {
    setLoading: (key: string, value: boolean) => void;
    loadingStates: Record<string, boolean>;
    handleError: (msg: string) => void;
    handleSuccess: (msg: string) => void;
    addWordToPending: (word: Partial<WordEntry>, force?: boolean) => void;
    addMultipleWordsToPending: (words: Partial<WordEntry>[], force?: boolean) => void;
    database: WordEntry[];
    pendingWords: Partial<WordEntry>[];
    approveWord: (id: string) => void;
    rejectWord: (id: string) => void;
    updatePendingWord: (word: Partial<WordEntry>) => void;
    pendingExclusions: PendingExclusion[];
    setPendingExclusions: React.Dispatch<React.SetStateAction<PendingExclusion[]>>;
    replacementMap: ReplacementRule[];
    setReplacementMap: React.Dispatch<React.SetStateAction<ReplacementRule[]>>;
}

const ExtractorView: FC<ExtractorViewProps> = ({ 
    setLoading, loadingStates, handleError, handleSuccess, 
    addWordToPending, addMultipleWordsToPending, database, pendingWords,
    approveWord, rejectWord, updatePendingWord,
    pendingExclusions, setPendingExclusions, replacementMap, setReplacementMap
}) => {
    const [text, setText] = useState('');
    const [suggestedConcepts, setSuggestedConcepts] = useState<string[]>([]);
    const [suggestionCategory, setSuggestionCategory] = useState<string>('عام');

    const suggestionCategories = [
        { value: 'عام', label: 'عام' },
        { value: 'خدمة العملاء', label: 'خدمة العملاء' },
        { value: 'التواصل', label: 'التواصل' },
        { value: 'الترفيه', label: 'الترفيه' },
        { value: 'التقنية', label: 'التقنية' },
        { value: 'الطعام والطبخ', label: 'الطعام والطبخ' },
        { value: 'السفر والأماكن', label: 'السفر والأماكن' },
    ];


    const handleAnalysis = async (mode: AnalysisMode) => {
        if (!text.trim()) {
            handleError("الرجاء إدخال نص للتحليل.");
            return;
        }
        setLoading(mode, true);
        try {
            if (mode === AnalysisMode.All) {
                const allWords = text.match(/[\u0600-\u06FF\w]+/g) || [];
                if (allWords.length > 0) {
                    const newWords = allWords.map(word => ({ hassaniya: word }));
                    addMultipleWordsToPending(newWords, true);
                } else {
                    handleSuccess("لم يتم العثور على كلمات في النص.");
                }
            } else {
                const results = await geminiService.analyzeText(text, mode, database);
                 if (results.length === 0) {
                   handleSuccess("لم يتم العثور على كلمات حسانية جديدة.");
                } else {
                   addMultipleWordsToPending(results);
                }
            }
            setText('');
        } catch (err: any) {
            handleError(err.message || "حدث خطأ أثناء التحليل.");
        } finally {
            setLoading(mode, false);
        }
    };
    
    const handleSuggestConcepts = async () => {
        setLoading('suggest', true);
        try {
            const concepts = await geminiService.suggestConcepts(database, suggestionCategory);
            setSuggestedConcepts(concepts);
            handleSuccess(`تم اقتراح ${concepts.length} معنى من فئة "${suggestionCategory}".`);
        } catch(err: any) {
            handleError(err.message || "فشل اقتراح المفاهيم.");
        } finally {
            setLoading('suggest', false);
        }
    }
    
    const approveExclusion = (exclusionId: string) => {
        const exclusion = pendingExclusions.find(pe => pe.id === exclusionId);
        if (!exclusion) return;

        if (replacementMap.some(r => r.original.toLowerCase() === exclusion.incorrectWord.toLowerCase())) {
            handleError(`قاعدة للكلمة "${exclusion.incorrectWord}" موجودة بالفعل.`);
        } else {
            const newRule: ReplacementRule = {
                id: generateUUID(),
                original: exclusion.incorrectWord,
                replacement: exclusion.suggestedReplacement,
            };
            setReplacementMap(prev => [newRule, ...prev]);
            handleSuccess(`تمت إضافة قاعدة استبدال لـ "${exclusion.incorrectWord}".`);
        }
        
        setPendingExclusions(prev => prev.filter(pe => pe.id !== exclusionId));
    };

    const rejectExclusion = (exclusionId: string) => {
        const exclusion = pendingExclusions.find(pe => pe.id === exclusionId);
        if(exclusion){
            handleSuccess(`تم تجاهل اقتراح استبعاد "${exclusion.incorrectWord}".`);
        }
        setPendingExclusions(prev => prev.filter(pe => pe.id !== exclusionId));
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                 <div className="flex justify-center gap-4">
                    <div className="bg-gray-200 dark:bg-gray-700 text-sm font-medium px-4 py-2 rounded-full">
                        {database.length} كلمة محفوظة
                    </div>
                 </div>
            </div>
            
            <Card>
                <div className="bg-gray-900 dark:bg-black p-4 rounded-lg mb-4">
                    <textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        rows={6}
                        className="w-full p-2 border-0 rounded-md bg-gray-900 dark:bg-black text-gray-200 focus:ring-purple-500 focus:border-purple-500 resize-none"
                        placeholder="أدخل النص هنا لتحليله واستخراج الكلمات الحسانية..."
                    />
                </div>
                 {suggestedConcepts.length > 0 && (
                    <div className="mb-4">
                        <h4 className="font-semibold mb-2">معاني مقترحة:</h4>
                        <div className="flex flex-wrap gap-2">
                            {suggestedConcepts.map((concept, i) => (
                                <button key={i} onClick={() => setText(prev => `${prev} ${concept}`)} className="bg-gray-200 dark:bg-gray-700 text-sm px-3 py-1 rounded-full hover:bg-gray-300 dark:hover:bg-gray-600">
                                    {concept}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                    <div className="flex flex-col sm:flex-row gap-2">
                        <Button onClick={handleSuggestConcepts} variant="purple" disabled={loadingStates['suggest']} className="w-full sm:w-2/3">
                            {loadingStates['suggest'] ? <Loader /> : '💡 اقتراح معنى'}
                        </Button>
                        <select
                            value={suggestionCategory}
                            onChange={e => setSuggestionCategory(e.target.value)}
                            className="p-2 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600 text-sm w-full sm:w-1/3"
                            aria-label="فئة الاقتراح"
                        >
                            {suggestionCategories.map(cat => <option key={cat.value} value={cat.value}>{cat.label}</option>)}
                        </select>
                    </div>
                    <Button onClick={() => handleAnalysis(AnalysisMode.All)} variant="dark" disabled={loadingStates[AnalysisMode.All] || !text}>
                        {loadingStates[AnalysisMode.All] ? <Loader /> : ' استخراج كل الكلمات'}
                    </Button>
                     <Button onClick={() => handleAnalysis(AnalysisMode.Confirmed)} variant="dark" disabled={loadingStates[AnalysisMode.Confirmed] || !text}>
                         {loadingStates[AnalysisMode.Confirmed] ? <Loader /> : 'تحليل مؤكد'}
                    </Button>
                    <Button onClick={() => handleAnalysis(AnalysisMode.NonMsa)} variant="orange" disabled={loadingStates[AnalysisMode.NonMsa] || !text}>
                        {loadingStates[AnalysisMode.NonMsa] ? <Loader /> : 'استخراج غير الفصحى'}
                    </Button>
                </div>
            </Card>

            <ExclusionReviewList
                pendingExclusions={pendingExclusions}
                approveExclusion={approveExclusion}
                rejectExclusion={rejectExclusion}
            />

            <ReviewList
                pendingWords={pendingWords}
                database={database}
                approveWord={approveWord}
                rejectWord={rejectWord}
                updatePendingWord={updatePendingWord}
            />

             <Card>
                <div className="flex items-center">
                    <DatabaseIcon className="w-10 h-10 text-blue-500" />
                    <div className="mr-4">
                        <h3 className="text-lg font-medium">قاعدة البيانات الحالية تحتوي على {database.length} كلمة.</h3>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">استخدم زر "اقتراح معنى" لتوليد مفاهيم عربية تحتاج لإدخال مرادفها الحساني.</p>
                    </div>
                </div>
            </Card>

        </div>
    );
};

export default ExtractorView;
