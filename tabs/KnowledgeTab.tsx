import React, { FC, useRef } from 'react';
import { KnowledgeDocument } from '../types';
import { Card, Button } from '../components/UI';
import { UploadIcon, TrashIcon } from '../components/Icons';
import { generateUUID } from '../utils';

interface KnowledgeTabProps {
    knowledgeBase: KnowledgeDocument[];
    setKnowledgeBase: React.Dispatch<React.SetStateAction<KnowledgeDocument[]>>;
    handleError: (msg: string) => void;
    handleSuccess: (msg: string) => void;
}

const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file, 'UTF-8');
    });
};

const KnowledgeTab: FC<KnowledgeTabProps> = ({ knowledgeBase, setKnowledgeBase, handleError, handleSuccess }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;

        const newDocuments: KnowledgeDocument[] = [];
        const existingFileNames = new Set(knowledgeBase.map(doc => doc.fileName.toLowerCase()));
        let skippedCount = 0;

        for (const file of files) {
            if (!file.name.toLowerCase().endsWith('.txt')) {
                handleError(`الملف "${file.name}" ليس ملف نصي (.txt) وسيتم تجاهله.`);
                continue;
            }

            if (existingFileNames.has(file.name.toLowerCase())) {
                skippedCount++;
                continue;
            }

            try {
                const content = await readFileAsText(file);
                newDocuments.push({
                    id: generateUUID(),
                    fileName: file.name,
                    content,
                    dateAdded: new Date().toISOString(),
                });
            } catch (err) {
                handleError(`فشل في قراءة الملف "${file.name}".`);
            }
        }
        
        if (newDocuments.length > 0) {
            setKnowledgeBase(prev => [...prev, ...newDocuments].sort((a,b) => a.fileName.localeCompare(b.fileName, 'ar')));
            handleSuccess(`تمت إضافة ${newDocuments.length} ملف معرفي جديد.`);
        }

        if (skippedCount > 0) {
            handleError(`تم تخطي ${skippedCount} ملف لأنها موجودة بالفعل.`);
        }
        
        if (event.target) event.target.value = "";
    };
    
    const deleteDocument = (id: string) => {
        const docToDelete = knowledgeBase.find(doc => doc.id === id);
        if (docToDelete) {
             setKnowledgeBase(prev => prev.filter(doc => doc.id !== id));
             handleSuccess(`تم حذف ملف المعرفة "${docToDelete.fileName}".`);
        }
    };

    return (
        <div className="space-y-4">
            <Card>
                <h2 className="text-xl font-bold mb-2">قاعدة المعرفة المخصصة</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    قم برفع ملفات نصية (.txt) تحتوي على معلومات محددة تريد أن يستخدمها النموذج كمصدر للمعرفة. يمكن تفعيل هذه المعرفة في تبويبي "الدردشة" و"الاختبار الصوتي".
                </p>
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" multiple accept=".txt,text/plain" />
                <Button onClick={() => fileInputRef.current?.click()} variant="secondary" className="gap-2">
                    <UploadIcon />
                    <span>رفع ملفات معرفة (.txt)</span>
                </Button>
            </Card>

            <Card>
                <h3 className="text-lg font-bold mb-4">ملفات المعرفة المحملة ({knowledgeBase.length})</h3>
                {knowledgeBase.length === 0 ? (
                     <p className="text-center p-8 text-gray-500">لم يتم رفع أي ملفات معرفة بعد.</p>
                ) : (
                    <div className="space-y-2 max-h-[calc(100vh-25rem)] overflow-y-auto pr-2">
                        {knowledgeBase.map(doc => (
                            <div key={doc.id} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-md">
                                <div>
                                    <p className="font-semibold">{doc.fileName}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        أضيف في: {new Date(doc.dateAdded).toLocaleDateString('en-CA')} - الحجم: {Math.round(doc.content.length / 1024)} كيلوبايت
                                    </p>
                                </div>
                                <button onClick={() => deleteDocument(doc.id)} className="text-gray-400 hover:text-red-500 p-2 rounded-full transition-colors">
                                    <TrashIcon />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </Card>
        </div>
    );
};

export default KnowledgeTab;
