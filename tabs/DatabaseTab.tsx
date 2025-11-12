import React, { useState, useMemo, FC, useRef, useEffect } from 'react';
import { WordEntry, PartOfSpeech, PARTS_OF_SPEECH_OPTIONS, ConversationFeedback, ReplacementRule } from '../types';
import { Card, Button, Loader } from '../components/UI';
import { SearchIcon, DownloadIcon, UploadIcon, TrashIcon } from '../components/Icons';
import { generateUUID, levenshtein } from '../utils';

interface DatabaseViewProps {
    database: WordEntry[];
    setDatabase: React.Dispatch<React.SetStateAction<WordEntry[]>>;
    setLoading: (key: string, value: boolean) => void;
    loadingStates: Record<string, boolean>;
    handleError: (msg: string) => void;
    handleSuccess: (msg: string) => void;
    conversationFeedback: ConversationFeedback[];
    setConversationFeedback: React.Dispatch<React.SetStateAction<ConversationFeedback[]>>;
    customInstructions: string;
    setCustomInstructions: React.Dispatch<React.SetStateAction<string>>;
    replacementMap: ReplacementRule[];
    setReplacementMap: React.Dispatch<React.SetStateAction<ReplacementRule[]>>;
    userStyleProfile: string;
    setUserStyleProfile: React.Dispatch<React.SetStateAction<string>>;
}

const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file, 'UTF-8');
    });
};


const DatabaseView: FC<DatabaseViewProps> = ({ 
    database, setDatabase,
    setLoading, loadingStates, handleError, handleSuccess,
    conversationFeedback, setConversationFeedback,
    customInstructions, setCustomInstructions,
    replacementMap, setReplacementMap,
    userStyleProfile, setUserStyleProfile
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [posFilter, setPosFilter] = useState<PartOfSpeech | 'all'>('all');
    const [localInstructions, setLocalInstructions] = useState(customInstructions);
    const [localProfile, setLocalProfile] = useState(userStyleProfile);
    const [newOriginal, setNewOriginal] = useState('');
    const [newReplacement, setNewReplacement] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setLocalInstructions(customInstructions);
    }, [customInstructions]);
    
    useEffect(() => {
        setLocalProfile(userStyleProfile);
    }, [userStyleProfile]);

    const handleSaveInstructions = () => {
        setCustomInstructions(localInstructions);
        handleSuccess("تم حفظ التعليمات المخصصة.");
    };
    
    const handleSaveProfile = () => {
        setUserStyleProfile(localProfile);
        handleSuccess("تم حفظ ملف تعريف الأسلوب.");
    };

    const handleClearProfile = () => {
        setUserStyleProfile('');
        handleSuccess("تم مسح ملف تعريف الأسلوب.");
    };


    const handleAddRule = () => {
        if (!newOriginal.trim()) {
            handleError("الرجاء إدخال الكلمة المراد استبعادها.");
            return;
        }
        const originalLower = newOriginal.trim().toLowerCase();
        if (replacementMap.some(r => r.original.toLowerCase() === originalLower)) {
            handleError("هذه القاعدة موجودة بالفعل.");
            return;
        }
        const newRule: ReplacementRule = {
            id: generateUUID(),
            original: newOriginal.trim(),
            replacement: newReplacement.trim(),
        };
        setReplacementMap(prev => [newRule, ...prev]);
        setNewOriginal('');
        setNewReplacement('');
        handleSuccess("تمت إضافة القاعدة بنجاح.");
    };

    const handleDeleteRule = (id: string) => {
        setReplacementMap(prev => prev.filter(rule => rule.id !== id));
    };

    const handleExport = () => {
        if (database.length === 0 && conversationFeedback.length === 0 && !customInstructions && replacementMap.length === 0 && !userStyleProfile) {
            handleError("لا توجد بيانات للتصدير.");
            return;
        }

        const exportData = {
            database,
            trainingData: conversationFeedback,
            customInstructions: customInstructions,
            replacementMap: replacementMap,
            userStyleProfile: userStyleProfile,
        };

        const jsonContent = JSON.stringify(exportData, null, 2);
        
        const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", "hassaniya_data_export.json");
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        handleSuccess("تم تصدير جميع البيانات بنجاح.");
    };

    const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;
        
        setLoading('import', true);

        let importedWordsCount = 0;
        let importedFeedbackCount = 0;
        let importedInstructions = false;
        let importedProfile = false;
        let importedRulesCount = 0;
        const invalidFiles: string[] = [];
        
        for (const file of files) {
            const isCsv = file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv';
            const isJson = file.name.toLowerCase().endsWith('.json') || file.type === 'application/json';

            if (!isCsv && !isJson) {
                invalidFiles.push(file.name);
                continue;
            }

            try {
                const text = await readFileAsText(file);
                
                if (isJson) {
                    const data = JSON.parse(text);

                    if (typeof data.customInstructions === 'string') {
                        setCustomInstructions(data.customInstructions);
                        importedInstructions = true;
                    }

                    if (typeof data.userStyleProfile === 'string') {
                        setUserStyleProfile(data.userStyleProfile);
                        importedProfile = true;
                    }

                    if (Array.isArray(data.database)) {
                        const newWords: WordEntry[] = data.database;
                        const uniqueNewWords = newWords.filter(newWord => 
                            newWord.hassaniya &&
                            !database.some(dbWord => dbWord.hassaniya.toLowerCase() === newWord.hassaniya.toLowerCase())
                        );
                        if (uniqueNewWords.length > 0) {
                            setDatabase(prev => [...prev, ...uniqueNewWords].sort((a,b) => a.hassaniya.localeCompare(b.hassaniya, 'ar')));
                            importedWordsCount += uniqueNewWords.length;
                        }
                    }

                    if (Array.isArray(data.trainingData)) {
                        const newFeedback: ConversationFeedback[] = data.trainingData;
                        const uniqueNewFeedback = newFeedback.filter(newFb =>
                            newFb.id &&
                            !conversationFeedback.some(fb => fb.id === newFb.id)
                        );
                        if (uniqueNewFeedback.length > 0) {
                            setConversationFeedback(prev => [...prev, ...uniqueNewFeedback]);
                            importedFeedbackCount += uniqueNewFeedback.length;
                        }
                    }
                    
                    if (Array.isArray(data.replacementMap)) {
                        const newRules: ReplacementRule[] = data.replacementMap;
                        const uniqueNewRules = newRules.filter(newRule =>
                            newRule.id && newRule.original &&
                            !replacementMap.some(r => r.original.toLowerCase() === newRule.original.toLowerCase())
                        );
                        if (uniqueNewRules.length > 0) {
                            setReplacementMap(prev => [...prev, ...uniqueNewRules]);
                            importedRulesCount += uniqueNewRules.length;
                        }
                    }

                } else if (isCsv) {
                     const newWords: WordEntry[] = [];
                     const rows = text.split(/\r?\n/).slice(1);
                
                     rows.forEach(row => {
                         const trimmedRow = row.trim();
                         if (trimmedRow === '') return;

                         const [hassaniya, arabic, partOfSpeechStr, notes] = trimmedRow.split(',').map(s => s.trim().replace(/^"|"$/g, ''));
                    
                         const partOfSpeech = (PARTS_OF_SPEECH_OPTIONS as string[]).includes(partOfSpeechStr)
                             ? partOfSpeechStr as PartOfSpeech
                             : PartOfSpeech.Unspecified;

                         if (hassaniya && arabic) {
                             newWords.push({
                                 id: generateUUID(),
                                 hassaniya,
                                 arabic,
                                 partOfSpeech,
                                 dateAdded: new Date().toISOString(),
                                 notes: notes || '',
                             });
                         }
                     });
                    
                     const uniqueNewWords = newWords.filter(newWord => 
                         !database.some(dbWord => dbWord.hassaniya.toLowerCase() === newWord.hassaniya.toLowerCase())
                     );

                     if (uniqueNewWords.length > 0) {
                         setDatabase(prev => [...prev, ...uniqueNewWords].sort((a,b) => a.hassaniya.localeCompare(b.hassaniya, 'ar')));
                         importedWordsCount += uniqueNewWords.length;
                     }
                }
            } catch (readError) {
                handleError(`فشل في قراءة أو معالجة الملف ${file.name}.`);
            }
        }
        
        let successMessages = [];
        if (importedWordsCount > 0) successMessages.push(`تم استيراد ${importedWordsCount} كلمة جديدة`);
        if (importedFeedbackCount > 0) successMessages.push(`تم استيراد ${importedFeedbackCount} سجل تدريب جديد`);
        if (importedRulesCount > 0) successMessages.push(`تم استيراد ${importedRulesCount} قاعدة استبدال جديدة`);
        if (importedInstructions) successMessages.push(`تم استيراد التعليمات المخصصة`);
        if (importedProfile) successMessages.push(`تم استيراد ملف تعريف الأسلوب`);

        
        if (successMessages.length > 0) {
            handleSuccess(successMessages.join(' و ') + '.');
        } else if (invalidFiles.length === 0) {
            handleSuccess("لم يتم العثور على بيانات جديدة للاستيراد. قد تكون موجودة بالفعل.");
        }

        if (invalidFiles.length > 0) {
            handleError(`الملفات التالية غير مدعومة (يجب أن تكون CSV أو JSON): ${invalidFiles.join(', ')}`);
        }
        
        if (event.target) event.target.value = "";
        setLoading('import', false);
    };


    const filteredData = useMemo(() => {
        const term = searchTerm.toLowerCase().trim();
        
        const posFiltered = database.filter(w => 
            posFilter === 'all' || w.partOfSpeech === posFilter
        );

        if (!term) {
            return posFiltered;
        }

        const threshold = term.length > 5 ? 2 : 1;

        return posFiltered
            .map(word => {
                const hassaniyaLower = word.hassaniya.toLowerCase();
                const arabicLower = word.arabic.toLowerCase();
                
                const hassaniyaDistance = levenshtein(hassaniyaLower, term);
                const arabicDistance = levenshtein(arabicLower, term);
                const distance = Math.min(hassaniyaDistance, arabicDistance);

                const includes = hassaniyaLower.includes(term) || arabicLower.includes(term);

                // A lower score is better.
                // Give a large bonus for substring matches to prioritize them.
                const score = includes ? distance - 100 : distance;
                
                return { ...word, score, distance };
            })
            // Keep if it's an includes match, or if it's a close fuzzy match
            .filter(word => word.score < 0 || word.distance <= threshold)
            .sort((a, b) => a.score - b.score);

    }, [searchTerm, posFilter, database]);

    return (
        <div className="space-y-4">
             <div className="flex justify-between items-center">
                 <h2 className="text-xl font-bold">إدارة البيانات</h2>
             </div>
             <Card>
                <h3 className="text-lg font-bold mb-2">تعليمات مخصصة</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                    أضف هنا أي معلومات أو سياق تريد أن يستخدمه النموذج في ردوده. على سبيل المثال: معلومات عن منتج، مجال خبرة، أو أسلوب معين للرد.
                </p>
                <textarea
                    value={localInstructions}
                    onChange={(e) => setLocalInstructions(e.target.value)}
                    rows={5}
                    className="w-full p-2 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600 focus:ring-1 focus:ring-indigo-500"
                    placeholder="مثال: أنت مساعد في متجر لبيع العطور. كن ودوداً وقدم اقتراحات بناءً على تفضيلات العميل."
                />
                <Button
                    onClick={handleSaveInstructions}
                    disabled={localInstructions === customInstructions}
                    className="mt-2 w-auto"
                >
                    حفظ التعليمات
                </Button>
            </Card>

            <Card>
                <h3 className="text-lg font-bold mb-2">ملف تعريف الأسلوب</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                    هذا الملخص يتم إنشاؤه تلقائيًا بعد المحادثات لتحليل أسلوبك. يستخدمه النموذج لمحاكاة طريقة كلامك وجعل الحوار طبيعيًا. يمكنك تعديله أو حذفه.
                </p>
                <textarea
                    value={localProfile}
                    onChange={(e) => setLocalProfile(e.target.value)}
                    rows={8}
                    className="w-full p-2 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600 focus:ring-1 focus:ring-indigo-500"
                    placeholder="سيتم ملء هذا الحقل تلقائيًا بعد تحليل محادثاتك..."
                />
                <div className="flex gap-2 mt-2">
                    <Button
                        onClick={handleSaveProfile}
                        disabled={localProfile === userStyleProfile}
                        className="w-auto"
                    >
                        حفظ ملف التعريف
                    </Button>
                    <Button
                        onClick={handleClearProfile}
                        variant="secondary"
                        disabled={!userStyleProfile}
                        className="w-auto"
                    >
                        مسح ملف التعريف
                    </Button>
                </div>
            </Card>

            <Card>
                <h3 className="text-lg font-bold mb-2">الاستبعادات والاستبدالات ({replacementMap.length})</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                    أضف قواعد لتجنب كلمات معينة أو استبدالها. سيتبع النموذج هذه القواعد بصرامة في جميع ردوده. اترك حقل "البديل" فارغًا لاستبعاد الكلمة تمامًا.
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                    <input
                        type="text"
                        value={newOriginal}
                        onChange={e => setNewOriginal(e.target.value)}
                        placeholder="الكلمة الأصلية (للاستبعاد أو الاستبدال)"
                        className="w-full p-2 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600"
                    />
                    <input
                        type="text"
                        value={newReplacement}
                        onChange={e => setNewReplacement(e.target.value)}
                        placeholder="الكلمة البديلة (اختياري)"
                        className="w-full p-2 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600"
                    />
                    <Button onClick={handleAddRule} className="w-full sm:w-auto">
                        إضافة قاعدة
                    </Button>
                </div>
                <div className="mt-4 space-y-2 max-h-48 overflow-y-auto">
                    {replacementMap.map(rule => (
                        <div key={rule.id} className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-700/50 rounded-md">
                            <div className="text-sm">
                                <span className="font-semibold text-red-500">{rule.original}</span>
                                <span className="mx-2">→</span>
                                {rule.replacement ? <span className="font-semibold text-green-500">{rule.replacement}</span> : <span className="text-gray-500 italic">(استبعاد)</span>}
                            </div>
                            <button onClick={() => handleDeleteRule(rule.id)} className="text-gray-400 hover:text-red-500 p-1">
                                <TrashIcon />
                            </button>
                        </div>
                    ))}
                </div>
            </Card>

            <Card>
                <h3 className="text-lg font-bold mb-4">قاعدة بيانات الكلمات ({database.length})</h3>
                <div className="flex flex-col sm:flex-row gap-2 mb-4">
                    <div className="relative flex-grow">
                        <input
                            type="search"
                            placeholder="ابحث عن كلمة أو معنى..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full p-2 pr-10 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600"
                        />
                        <SearchIcon className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    </div>
                    <select
                        value={posFilter}
                        onChange={e => setPosFilter(e.target.value as PartOfSpeech | 'all')}
                        className="p-2 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600"
                    >
                        <option value="all">جميع التصنيفات</option>
                        {PARTS_OF_SPEECH_OPTIONS.map(pos => <option key={pos} value={pos}>{pos}</option>)}
                    </select>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-2 mb-4 border-b dark:border-gray-700 pb-4">
                    <input type="file" ref={fileInputRef} onChange={handleImport} className="hidden" multiple accept=".csv,text/csv,application/vnd.ms-excel,.json,application/json" />
                    <Button 
                        onClick={() => fileInputRef.current?.click()} 
                        variant="secondary"
                        disabled={loadingStates['import']}
                        className="w-full sm:w-auto"
                    >
                        {loadingStates['import'] ? <Loader /> : <UploadIcon />}
                        <span className="mr-2">استيراد CSV / JSON</span>
                    </Button>
                    <Button 
                        onClick={handleExport} 
                        variant="secondary"
                        disabled={database.length === 0 && conversationFeedback.length === 0 && !customInstructions && replacementMap.length === 0}
                        className="w-full sm:w-auto"
                    >
                        <DownloadIcon />
                        <span className="mr-2">تصدير الكل (JSON)</span>
                    </Button>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-right">
                        <thead>
                            <tr className="border-b dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400">
                                <th className="p-2 font-medium text-start">الكلمة</th>
                                <th className="p-2 font-medium text-start">المعنى</th>
                                <th className="p-2 font-medium text-center">التصنيف</th>
                                <th className="p-2 font-medium text-start">ملاحظات</th>
                                <th className="p-2 font-medium text-start">تاريخ الإضافة</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredData.map(word => (
                                <tr key={word.id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                    <td className="p-3 font-semibold">{word.hassaniya}</td>
                                    <td className="p-3">{word.arabic}</td>
                                    <td className="p-3 text-center">
                                        <span className="bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300 px-2.5 py-1 rounded-full text-xs font-medium">
                                            {word.partOfSpeech}
                                        </span>
                                    </td>
                                    <td className="p-3 text-sm text-gray-500 max-w-xs truncate" title={word.notes}>
                                        {word.notes || '-'}
                                    </td>
                                    <td className="p-3 text-sm text-gray-500">
                                        {new Date(word.dateAdded).toLocaleDateString('en-CA')}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                     {filteredData.length === 0 && <p className="text-center p-8 text-gray-500">لا توجد نتائج مطابقة.</p>}
                </div>
            </Card>
        </div>
    );
};

export default DatabaseView;