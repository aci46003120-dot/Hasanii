import React, { FC, useState, useEffect } from 'react';
import { ConversationFeedback, ChatMessage } from '../types';
import { Card, Button } from '../components/UI';
import { ThumbsUpIcon, ThumbsDownIcon, TrashIcon } from '../components/Icons';
import { generateUUID } from '../utils';

interface TrainingDataTabProps {
  feedbackData: ConversationFeedback[];
  deleteFeedback: (id: string) => void;
  updateFeedback: (id: string, updates: Partial<ConversationFeedback>) => void;
  addConversationFeedback: (feedback: Omit<ConversationFeedback, 'id' | 'timestamp'>) => void;
}

const FeedbackItem: FC<{ item: ConversationFeedback; onDelete: () => void; onUpdate: (updates: Partial<ConversationFeedback>) => void; }> = ({ item, onDelete, onUpdate }) => {
    const [notes, setNotes] = useState(item.notes || '');
    const ratedMessage = item.context.find(m => m.id === item.ratedMessageId);

    useEffect(() => {
        setNotes(item.notes || '');
    }, [item.notes]);

    // Find the user message that prompted the model's rated response
    const userPromptIndex = item.context.findIndex(m => m.id === item.ratedMessageId) - 1;
    const userPrompt = userPromptIndex >= 0 ? item.context[userPromptIndex] : null;

    if (!ratedMessage) return null;

    const handleNotesBlur = () => {
        if (notes !== (item.notes || '')) {
            onUpdate({ notes });
        }
    };

    return (
        <Card className="mb-4">
            <div className="flex justify-between items-start">
                <div className="flex-1">
                    {userPrompt && (
                        <div className="mb-3">
                            <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold mb-1">المستخدم سأل:</p>
                            <p className="text-sm p-2 bg-gray-100 dark:bg-gray-700/50 rounded-md">{userPrompt.text}</p>
                        </div>
                    )}
                    <div className="mb-3">
                        <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold mb-1">النموذج أجاب:</p>
                        <p className="text-sm p-2 bg-gray-100 dark:bg-gray-700/50 rounded-md">{ratedMessage.text}</p>
                    </div>
                     <div className="mt-3">
                        <label className="text-xs text-gray-500 dark:text-gray-400 font-semibold mb-1 block">ملاحظات وتصحيحات:</label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            onBlur={handleNotesBlur}
                            placeholder="أضف تصحيحًا أو سببًا للتقييم..."
                            className="w-full p-2 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600 focus:ring-1 focus:ring-indigo-500 text-sm"
                            rows={2}
                        />
                    </div>
                </div>
                <div className="flex flex-col items-center gap-4 ml-4">
                    {item.rating === 'good' 
                        ? <ThumbsUpIcon filled className="text-green-500 h-6 w-6" />
                        : <ThumbsDownIcon filled className="text-red-500 h-6 w-6" />
                    }
                    <Button onClick={onDelete} variant="secondary" className="p-2 w-auto h-auto">
                        <TrashIcon />
                    </Button>
                </div>
            </div>
            <p className="text-xs text-gray-400 mt-2 text-left">{new Date(item.timestamp).toLocaleString()}</p>
        </Card>
    );
};

const TrainingDataTab: FC<TrainingDataTabProps> = ({ feedbackData, deleteFeedback, updateFeedback, addConversationFeedback }) => {
  const [userPrompt, setUserPrompt] = useState('');
  const [modelResponse, setModelResponse] = useState('');

  const handleAddExample = () => {
    if (!userPrompt.trim() || !modelResponse.trim()) {
      return; // Button is disabled, but as a safeguard
    }

    const userMessage: ChatMessage = {
      id: generateUUID(),
      role: 'user',
      text: userPrompt.trim(),
    };
    const modelMessage: ChatMessage = {
      id: generateUUID(),
      role: 'model',
      text: modelResponse.trim(),
      rating: 'good' // It's an ideal example
    };

    const newFeedback: Omit<ConversationFeedback, 'id' | 'timestamp'> = {
      ratedMessageId: modelMessage.id,
      context: [userMessage, modelMessage],
      rating: 'good',
      notes: 'مثال تدريبي تمت إضافته يدويًا',
    };

    addConversationFeedback(newFeedback);
    setUserPrompt('');
    setModelResponse('');
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">بيانات تدريب المحادثة ({feedbackData.length})</h2>

      <Card>
        <h3 className="text-lg font-bold mb-2">إضافة مثال تدريبي يدوي</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            قم بتوجيه النموذج عن طريق تقديم أمثلة على المحادثات. أدخل رسالة المستخدم والرد المثالي الذي يجب أن يقدمه النموذج.
        </p>
        <div className="space-y-3">
            <div>
                <label htmlFor="user-prompt" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">رسالة المستخدم</label>
                <textarea
                    id="user-prompt"
                    value={userPrompt}
                    onChange={(e) => setUserPrompt(e.target.value)}
                    rows={3}
                    className="w-full p-2 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600 focus:ring-1 focus:ring-indigo-500"
                    placeholder="مثال: ما هي عاصمة موريتانيا؟"
                />
            </div>
            <div>
                <label htmlFor="model-response" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">الرد المثالي من النموذج (بالحسانية)</label>
                <textarea
                    id="model-response"
                    value={modelResponse}
                    onChange={(e) => setModelResponse(e.target.value)}
                    rows={4}
                    className="w-full p-2 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600 focus:ring-1 focus:ring-indigo-500"
                    placeholder="مثال: عاصمة موريتانيا هي نواكشوط."
                />
            </div>
            <Button onClick={handleAddExample} disabled={!userPrompt.trim() || !modelResponse.trim()} className="w-auto">
                إضافة مثال تدريبي
            </Button>
        </div>
      </Card>

      <p className="text-sm text-gray-600 dark:text-gray-400">
        هنا يتم تخزين جميع تقييماتك وردودك التدريبية. يتم استخدام الردود ذات التقييم الإيجابي (👍) والأمثلة اليدوية، والردود السلبية (👎) مع ملاحظاتك، لتحسين أسلوب النموذج في المحادثات المستقبلية.
      </p>

      {feedbackData.length === 0 ? (
        <Card className="text-center py-8">
          <p className="text-gray-500">لا توجد بيانات تدريبية بعد.</p>
          <p className="text-sm text-gray-400 mt-2">ابدأ بإضافة مثال يدوي أو قم بتقييم ردود النموذج في تبويب الدردشة.</p>
        </Card>
      ) : (
        <div className="max-h-[calc(100vh-15rem)] overflow-y-auto pr-2">
            {feedbackData.map(item => (
                <FeedbackItem 
                    key={item.id} 
                    item={item} 
                    onDelete={() => deleteFeedback(item.id)}
                    onUpdate={(updates) => updateFeedback(item.id, updates)}
                />
            ))}
        </div>
      )}
    </div>
  );
};

export default TrainingDataTab;