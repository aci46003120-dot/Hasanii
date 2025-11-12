import React, { useState, useEffect, useRef, FC } from 'react';
import { Chat, FunctionCall } from '@google/genai';
import { ChatMessage, ConversationFeedback, WordEntry, GroundingSource, ReplacementRule, KnowledgeDocument, ChatMode } from '../types';
import * as geminiService from '../services/geminiService';
import { Card, Button, ToggleButton, Loader } from '../components/UI';
import { SendIcon, ThumbsUpIcon, ThumbsDownIcon, DatabaseIcon, GlobeIcon, LinkIcon, AcademicCapIcon, ChatIcon, BrainIcon } from '../components/Icons';
import { generateUUID } from '../utils';

type ChatTabVariant = 'full' | 'simple';

interface ChatTabProps {
  handleFunctionCall: (functionCall: FunctionCall) => void;
  handleError: (msg: string) => void;
  conversationFeedback: ConversationFeedback[];
  addConversationFeedback: (feedback: Omit<ConversationFeedback, 'id' | 'timestamp'>) => void;
  database: WordEntry[];
  customInstructions: string;
  replacementMap: ReplacementRule[];
  knowledgeBase: KnowledgeDocument[];
  userStyleProfile: string;
  handleAnalyzeConversation: (transcript: ChatMessage[]) => void;
  loadingStates: Record<string, boolean>;
  variant?: ChatTabVariant;
}

const ChatTab: FC<ChatTabProps> = ({ 
  handleFunctionCall, handleError, conversationFeedback, addConversationFeedback, database, 
  customInstructions, replacementMap, knowledgeBase, userStyleProfile, handleAnalyzeConversation, loadingStates,
  variant = 'full'
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  
  const [chatMode, setChatMode] = useState<ChatMode>('standard');
  // State for standard mode toggles
  const [useDatabase, setUseDatabase] = useState(true);
  const [useWebSearch, setUseWebSearch] = useState(false);
  const [useKnowledge, setUseKnowledge] = useState(false);

  const [siteSearchUrl, setSiteSearchUrl] = useState('');
  
  const chatSessionRef = useRef<Chat | null>(null);
  const messagesEndRef = useRef<null | HTMLDivElement>(null);
  const isSimple = variant === 'simple';

  useEffect(() => {
    chatSessionRef.current = geminiService.createChat(conversationFeedback);
    setMessages([
      { id: generateUUID(), role: 'model', text: 'أهلاً بك! أنا خبيرك في اللهجة الحسانية. عن ماذا تريد أن نتحدث اليوم؟' }
    ]);
  }, []); 

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const messageText = input.trim();
    if (!messageText || isThinking) return;

    setIsThinking(true);
    setInput('');
    
    const userMessage: ChatMessage = { id: generateUUID(), role: 'user', text: messageText };
    setMessages(prev => [...prev, userMessage]);

    let apiMessageText = messageText;
    const shouldUseSiteSearch = (chatMode === 'web_search' || (chatMode === 'standard' && useWebSearch)) && siteSearchUrl.trim();
    if (shouldUseSiteSearch) {
        const domain = siteSearchUrl.trim().replace(/^https?:\/\//, '').split('/')[0];
        apiMessageText = `site:${domain} ${messageText}`;
    }

    const apiHistory = [...messages, { ...userMessage, text: apiMessageText }];

    try {
        const response = await geminiService.sendGroundedMessage(
            apiHistory,
            chatMode,
            useDatabase,
            useWebSearch,
            database,
            conversationFeedback,
            customInstructions,
            replacementMap,
            knowledgeBase,
            useKnowledge,
            userStyleProfile,
        );
      
      if (response.functionCalls && response.functionCalls.length > 0) {
        response.functionCalls.forEach(handleFunctionCall);
      }
      
      const modelResponseText = response.text?.trim() ?? '';
      
      const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      const sources: GroundingSource[] = groundingChunks
          ?.map((chunk: any) => chunk.web ? { uri: chunk.web.uri, title: chunk.web.title } : null)
          .filter((s: GroundingSource | null): s is GroundingSource => s !== null) || [];
        
      if (modelResponseText) {
          const modelMessage: ChatMessage = { id: generateUUID(), role: 'model', text: modelResponseText, sources };
          setMessages(prev => [...prev, modelMessage]);
      } else if (sources.length > 0) {
          const modelMessage: ChatMessage = { id: generateUUID(), role: 'model', text: "لقد وجدت بعض المصادر التي قد تكون ذات صلة.", sources };
          setMessages(prev => [...prev, modelMessage]);
      }

    } catch (err) {
      console.error("Chat error:", err);
      handleError("حدث خطأ أثناء إرسال الرسالة.");
      setInput(messageText);
      setMessages(prev => prev.filter(m => m.id !== userMessage.id));

    } finally {
      setIsThinking(false);
    }
  };

  const handleRating = (messageId: string, rating: 'good' | 'bad') => {
    const messageIndex = messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return;

    setMessages(prev => prev.map(msg => msg.id === messageId ? { ...msg, rating } : msg));
    
    const context = messages.slice(0, messageIndex + 1);
    addConversationFeedback({ ratedMessageId: messageId, context, rating });
  };
  
  const handleSessionEnd = () => {
    handleAnalyzeConversation(messages);
    setMessages([
        { id: generateUUID(), role: 'model', text: 'تم تحليل الجلسة السابقة وتحديث ملف الأسلوب. أهلاً بك من جديد!' }
    ]);
  };

  const ModeSelector = () => {
    if (isSimple) return null;
    const modes: { id: ChatMode; label: string; icon: React.ReactNode, disabled?: boolean }[] = [
      { id: 'standard', label: 'قياسي', icon: <ChatIcon /> },
      { id: 'database_only', label: 'قاعدة البيانات فقط', icon: <DatabaseIcon />, disabled: database.length === 0 },
      { id: 'web_search', label: 'بحث الويب', icon: <GlobeIcon /> },
      { id: 'knowledge_base', label: 'قاعدة المعرفة', icon: <AcademicCapIcon />, disabled: knowledgeBase.length === 0 },
    ];
    return (
      <div className="flex items-center flex-wrap gap-2 mb-3 pb-3 border-b dark:border-gray-700">
        <span className="text-xs font-semibold text-gray-500">وضع الرد:</span>
        {modes.map(mode => (
          <button
            key={mode.id}
            onClick={() => !mode.disabled && setChatMode(mode.id)}
            disabled={mode.disabled}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              chatMode === mode.id ? 'bg-indigo-600 text-white' : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'
            }`}
             title={mode.disabled ? 'يرجى إضافة بيانات أولاً' : ''}
          >
            {mode.icon} {mode.label}
          </button>
        ))}
      </div>
    );
  };


  return (
    <Card className={`flex flex-col ${isSimple ? 'h-full min-h-[32rem]' : 'h-[calc(100vh-12rem)]'}`}>
      <h2 className="text-xl font-bold mb-2">الدردشة مع الخبير اللغوي</h2>
      
      <ModeSelector />
      
       {!isSimple && chatMode === 'standard' && (
           <div className="flex items-center flex-wrap gap-2 mb-3">
              <span className="text-xs font-semibold text-gray-500">مصادر المعلومات (الوضع القياسي):</span>
               <ToggleButton isEnabled={useDatabase} onToggle={() => setUseDatabase(v => !v)} icon={<DatabaseIcon className="h-4 w-4" />}>
                   استخدام قاعدة بياناتي
               </ToggleButton>
               <ToggleButton isEnabled={useWebSearch} onToggle={() => setUseWebSearch(v => !v)} icon={<GlobeIcon className="h-4 w-4" />}>
                   استخدام بحث جوجل
               </ToggleButton>
               <ToggleButton isEnabled={useKnowledge} onToggle={() => setUseKnowledge(v => !v)} icon={<AcademicCapIcon />} disabled={knowledgeBase.length === 0}>
                  استخدام المعرفة ({knowledgeBase.length})
              </ToggleButton>
           </div>
       )}

      {!isSimple && (chatMode === 'web_search' || (chatMode === 'standard' && useWebSearch)) && (
          <div className="relative flex-grow-0 mb-3">
              <input
                  type="text"
                  value={siteSearchUrl}
                  onChange={e => setSiteSearchUrl(e.target.value)}
                  placeholder="تقييد البحث بموقع (اختياري, e.g., example.com)"
                  className="w-full p-2 pr-8 text-xs border rounded-full bg-gray-50 dark:bg-gray-700 dark:border-gray-600 focus:ring-1 focus:ring-indigo-500"
                  aria-label="تقييد البحث بموقع"
              />
              <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-gray-400">
                   <LinkIcon />
              </div>
          </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
        {messages.map((msg) => (
          <div key={msg.id}>
            <div className={`flex items-end gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-md lg:max-w-lg px-4 py-2 rounded-2xl shadow-sm ${
                  msg.role === 'user'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                }`}
              >
                <p className="text-sm" style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</p>
              </div>
               {!isSimple && msg.role === 'model' && (
                  <div className="flex gap-1 mb-1">
                      {!msg.rating ? (
                          <>
                              <button onClick={() => handleRating(msg.id, 'good')} className="p-1 text-gray-400 hover:text-green-500 rounded-full"><ThumbsUpIcon /></button>
                              <button onClick={() => handleRating(msg.id, 'bad')} className="p-1 text-gray-400 hover:text-red-500 rounded-full"><ThumbsDownIcon /></button>
                          </>
                      ) : (
                          msg.rating === 'good' 
                              ? <ThumbsUpIcon filled className="h-5 w-5 text-green-500" />
                              : <ThumbsDownIcon filled className="h-5 w-5 text-red-500" />
                      )}
                  </div>
              )}
            </div>
            {msg.sources && msg.sources.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2" dir="ltr">
                    {msg.sources.map((source, index) => (
                        <a 
                            key={index} 
                            href={source.uri} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-700/50 hover:bg-gray-200 dark:hover:bg-gray-600/50 px-2 py-1 rounded-md text-xs text-gray-600 dark:text-gray-300 transition-colors"
                        >
                            <LinkIcon />
                            <span className="truncate max-w-xs">{source.title || new URL(source.uri).hostname}</span>
                        </a>
                    ))}
                </div>
            )}
          </div>
        ))}
        {isThinking && (
            <div className="flex justify-start">
                 <div className="max-w-md lg:max-w-lg px-4 py-2 rounded-2xl shadow-sm bg-white dark:bg-gray-700">
                    <div className="flex items-center justify-center space-x-1">
                        <span className="h-2 w-2 bg-gray-500 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                        <span className="h-2 w-2 bg-gray-500 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                        <span className="h-2 w-2 bg-gray-500 rounded-full animate-bounce"></span>
                    </div>
                </div>
            </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={handleSendMessage} className="mt-4 flex items-center gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSendMessage(e);
            }
          }}
          placeholder="اكتب رسالتك هنا..."
          className="flex-1 p-2 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 resize-none"
          rows={1}
          disabled={isThinking}
        />
        <Button type="submit" variant="primary" disabled={isThinking || !input.trim()} className="w-auto p-2.5">
          <SendIcon />
        </Button>
         {!isSimple && messages.length > 2 && (
           <Button
               type="button"
               onClick={handleSessionEnd}
               variant="secondary"
               disabled={loadingStates['style-analysis']}
               className="w-auto p-2.5"
               title="إنهاء وتحليل الجلسة"
           >
               {loadingStates['style-analysis'] ? <Loader /> : <BrainIcon className="w-5 h-5" />}
           </Button>
       )}
      </form>
    </Card>
  );
};

export default ChatTab;