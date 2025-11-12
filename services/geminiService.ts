import { GoogleGenAI, Type, FunctionDeclaration, LiveSession, Modality, Chat, GenerateContentResponse } from "@google/genai";
import { WordEntry, PartOfSpeech, AnalysisMode, ConversationFeedback, ChatMessage, ReplacementRule, AnalyzedWord, KnowledgeDocument, ChatMode } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });


// --- Function Calling Declaration ---
export const addWordFunctionDeclaration: FunctionDeclaration = {
  name: 'add_word_to_pending_list',
  description: 'عندما يعلمك المستخدم كلمة حسانية جديدة، استخدم هذه الدالة. التقط الكلمة الحسانية ومعناها العربي الفصيح وتصنيفها النحوي.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      hassaniya_word: {
        type: Type.STRING,
        description: 'الكلمة بلهجة الحسانية.',
      },
      arabic_meaning: {
        type: Type.STRING,
        description: 'المعنى المقابل للكلمة باللغة العربية الفصحى.',
      },
      part_of_speech: {
        type: Type.STRING,
        description: 'التصنيف النحوي للكلمة.',
        enum: Object.values(PartOfSpeech),
      },
    },
    required: ['hassaniya_word', 'arabic_meaning', 'part_of_speech'],
  },
};

export const suggestWordForExclusionFunctionDeclaration: FunctionDeclaration = {
  name: 'suggest_word_for_exclusion',
  description: 'عندما تصحح كلمة للمستخدم لأنها غير صحيحة أو غير قياسية في الحسانية، استخدم هذه الدالة للإبلاغ عن كلمتهم الأصلية للمراجعة. قدم الكلمة الأصلية وتصحيحك المقترح.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      incorrect_word: {
        type: Type.STRING,
        description: 'الكلمة الأصلية غير الصحيحة التي استخدمها المستخدم.',
      },
      suggested_replacement: {
        type: Type.STRING,
        description: 'الكلمة الصحيحة أو البديلة التي تقترحها.',
      },
    },
    required: ['incorrect_word', 'suggested_replacement'],
  },
};

export const addWordToExclusionListFunctionDeclaration: FunctionDeclaration = {
  name: 'add_word_to_exclusion_list',
  description: 'عندما يطلب المستخدم صراحة استبعاد كلمة أو استبدالها بأخرى، استخدم هذه الدالة. التقط الكلمة الأصلية والبديل (إن وجد).',
  parameters: {
    type: Type.OBJECT,
    properties: {
      original_word: {
        type: Type.STRING,
        description: 'الكلمة الأصلية التي يجب استبعادها أو استبدالها.',
      },
      replacement_word: {
        type: Type.STRING,
        description: 'الكلمة البديلة. اتركها فارغة إذا كان المطلوب هو الاستبعاد فقط.',
      },
    },
    required: ['original_word'],
  },
};


// --- Text Analysis Services ---

export const analyzeText = async (text: string, mode: AnalysisMode, existingDb: WordEntry[]): Promise<Partial<WordEntry>[]> => {
  let prompt = '';
  
  switch (mode) {
    case AnalysisMode.Confirmed:
      const existingWordsContext = existingDb.map(w => `${w.hassaniya}${w.notes ? ` (${w.notes})` : ''}`).join(', ');
      prompt = `أنت خبير لغوي متخصص في لهجة الحسانية العربية. حلل النص التالي. استخرج فقط الكلمات التي هي بشكل فريد وحاسم من لهجة الحسانية وليست شائعة في اللغة العربية الفصحى المعيارية (MSA). لكل كلمة، قدم معناها الأكثر احتمالاً في MSA. هذه قائمة بالكلمات الموجودة بالفعل في قاعدة بياناتي (مع ملاحظات) لتجنبها: ${existingWordsContext}. أعد النتيجة كـ JSON array of objects، كل كائن يحتوي على مفتاحي 'hassaniya' و 'arabic'. إذا لم تجد أي كلمات، أعد مصفوفة فارغة. من المهم جداً أن تستخرج جميع الكلمات المطابقة من النص، وليس كلمة واحدة فقط.`;
      break;
    case AnalysisMode.NonMsa:
      prompt = `أنت محلل لغوي. حلل النص التالي. استخرج كل الكلمات التي ليست جزءًا من اللغة العربية الفصحى المعيارية (MSA). يمكن أن يشمل ذلك كلمات حسانية، أو كلمات مستعارة، أو غيرها من التنويعات اللهجية. لكل كلمة، قدم معناها الأكثر احتمالاً في MSA. أعد النتيجة كـ JSON array of objects، كل كائن يحتوي على مفتاحي 'hassaniya' و 'arabic'. إذا لم تجد أي كلمات، أعد مصفوفة فارغة. من المهم جداً أن تستخرج جميع الكلمات المطابقة من النص، وليس كلمة واحدة فقط.`;
      break;
    default:
      return [];
  }

  try {
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: `${prompt}\n\nالنص:\n${text}`,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        hassaniya: { type: Type.STRING },
                        arabic: { type: Type.STRING },
                    },
                    required: ['hassaniya', 'arabic'],
                },
            },
        }
    });
    
    const responseText = response.text?.trim();
    if (!responseText) {
        console.warn("Analyze text response from Gemini was empty.");
        return [];
    }
    const json = JSON.parse(responseText);
    if (Array.isArray(json)) {
      return json.filter((item): item is Partial<WordEntry> => item && typeof item.hassaniya === 'string' && typeof item.arabic === 'string');
    }
    return [];
  } catch (error) {
    console.error("Error analyzing text with Gemini:", error);
    throw new Error("فشل تحليل النص. قد تكون استجابة واجهة برمجة التطبيقات غير صالحة.");
  }
};

export const comprehendText = async (text: string, database: WordEntry[]): Promise<AnalyzedWord[]> => {
    const dbString = database.map(w => `${w.hassaniya}: ${w.arabic}`).join('; ');
    const prompt = `أنت خبير لغوي باللهجة الحسانية. مهمتك تحليل النص التالي وتحديد كل الكلمات التي يُحتمل أن تكون من اللهجة الحسانية وليست من العربية الفصحى المعيارية.
استخدم قاموسي المرفق كمرجع أساسي لتحديد الكلمات المعروفة.
لكل كلمة حسانية تجدها في النص:
1. استخرج الكلمة الحسانية كما هي في النص.
2. قدم معناها بالعربية الفصحى. إذا كانت الكلمة في قاموسي، استخدم المعنى الموجود. إذا لم تكن موجودة، استنتج المعنى الأنسب من السياق.
3. اقتبس الجملة الكاملة التي وردت فيها الكلمة.

القاموس:
${dbString}

النص للتحليل:
${text}

أعد النتيجة كمصفوفة JSON من الكائنات، مرتبة حسب ظهور الكلمات في النص. كل كائن يحتوي على: 'hassaniya', 'arabic', 'context'. تأكد من أن تكون الكلمات المستخرجة فريدة (لا تكرر نفس الكلمة إذا ظهرت عدة مرات بنفس المعنى).`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-pro',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            hassaniya: { type: Type.STRING, description: 'الكلمة باللهجة الحسانية المستخرجة من النص.' },
                            arabic: { type: Type.STRING, description: 'المعنى المقابل بالعربية الفصحى.' },
                            context: { type: Type.STRING, description: 'الجملة الكاملة التي ظهرت فيها الكلمة.' },
                        },
                        required: ['hassaniya', 'arabic', 'context'],
                    },
                },
            }
        });

        const responseText = response.text?.trim();
        if (!responseText) {
            console.error("Comprehend text response from Gemini was empty or invalid:", response);
            return [];
        }
        const json = JSON.parse(responseText);
        if (Array.isArray(json)) {
            return json.filter((item): item is AnalyzedWord => 
                item && 
                typeof item.hassaniya === 'string' && 
                typeof item.arabic === 'string' &&
                typeof item.context === 'string'
            );
        }
        return [];
    } catch (error) {
        console.error("Error comprehending text with Gemini:", error);
        throw new Error("فشل فهم النص. قد تكون استجابة واجهة برمجة التطبيقات غير صالحة.");
    }
};

export const generateQnAFromText = async (text: string, database: WordEntry[]): Promise<{question: string, answer: string}[]> => {
    const dbString = database.map(w => `${w.hassaniya}: ${w.arabic}`).join('; ');
    const prompt = `أنت مساعد ذكي متخصص في تحليل النصوص باللهجة الحسانية. مهمتك هي قراءة النص التالي، وفهمه بعمق بالاستعانة بالقاموس المرفق. بناءً على النص فقط، قم بتوقع 5 أسئلة محتملة قد يطرحها المستخدم حول محتوى النص، ثم قم بصياغة إجابة دقيقة وموجزة لكل سؤال باللهجة الحسانية.
القاموس (للمساعدة في فهم اللهجة):
${dbString}

النص للتحليل:
${text}

أعد النتيجة كمصفوفة JSON من الكائنات. كل كائن يجب أن يحتوي على مفتاحين: 'question' (السؤال المتوقع) و 'answer' (الإجابة بالحسانية).`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-pro',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            question: { type: Type.STRING, description: 'السؤال المحتمل الذي قد يطرحه المستخدم.' },
                            answer: { type: Type.STRING, description: 'الإجابة المقترحة على السؤال باللهجة الحسانية.' },
                        },
                        required: ['question', 'answer'],
                    },
                },
            }
        });

        const responseText = response.text?.trim();
        if (!responseText) {
            console.error("Generate Q&A response from Gemini was empty or invalid:", response);
            return [];
        }
        const json = JSON.parse(responseText);
        if (Array.isArray(json)) {
            return json.filter((item): item is {question: string, answer: string} => 
                item && 
                typeof item.question === 'string' && 
                typeof item.answer === 'string'
            );
        }
        return [];
    } catch (error) {
        console.error("Error generating Q&A with Gemini:", error);
        throw new Error("فشل في توليد الأسئلة والأجوبة. قد تكون استجابة واجهة برمجة التطبيقات غير صالحة.");
    }
};

export const suggestConcepts = async (existingDb: WordEntry[], category: string = 'عام'): Promise<string[]> => {
    const existingConcepts = existingDb.map(w => w.arabic).filter(Boolean).join(', ');
    
    const themeInstruction = category === 'عام' || !category
        ? "شائعًا ويوميًا"
        : `مرتبطًا بمجال "${category}"`;

    const prompt = `أنشئ مصفوفة JSON تحتوي على 15 مفهومًا عربيًا ${themeInstruction} من المرجح أن يكون لها مرادفات مميزة في اللهجات الإقليمية. يجب أن تكون هذه المفاهيم جديدة ومختلفة عن تلك الموجودة بالفعل في القائمة التالية: ${existingConcepts}. يجب أن تغطي المفاهيم مجموعة من الموضوعات مثل الأشياء والأفعال والمشاعر. على سبيل المثال: 'سيارة'، 'طبخ'، 'سعادة'. يجب أن تكون الاستجابة مصفوفة JSON من السلاسل النصية فقط.`;
    
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.STRING,
                    },
                },
            }
        });
        const responseText = response.text?.trim();
        if (!responseText) {
            console.warn("Suggest concepts response from Gemini was empty.");
            return [];
        }
        const json = JSON.parse(responseText);
        if (Array.isArray(json)) {
            return json.filter((item): item is string => typeof item === 'string');
        }
        return [];
    } catch (error) {
        console.error("Error suggesting concepts:", error);
        throw new Error("فشل في اقتراح المفاهيم.");
    }
}

// --- Chat Services ---
const formatFeedbackAsFewShot = (feedback: ConversationFeedback[]): string => {
    if (!feedback || feedback.length === 0) return '';
    
    const examples = feedback
        .slice(-5) 
        .map(f => {
            const ratedMessage = f.context.find(m => m.id === f.ratedMessageId);
            if (!ratedMessage) return '';
            
            const userPromptIndex = f.context.findIndex(m => m.id === f.ratedMessageId) - 1;
            if (userPromptIndex < 0) return '';

            const userMessage = f.context[userPromptIndex];
            if (userMessage.role !== 'user') return '';

            if (f.rating === 'good') {
                 return `مثال على رد جيد (محتوى وأسلوب مناسبان):\nالمستخدم: "${userMessage.text}"\nأنت: "${ratedMessage.text}"`;
            } else if (f.rating === 'bad' && f.notes) {
                return `مثال على خطأ يجب تجنبه:\nالمستخدم: "${userMessage.text}"\nأنت (رد خاطئ): "${ratedMessage.text}"\nتصحيح/ملاحظة: "${f.notes}"`;
            }
            return '';
        })
        .filter(Boolean)
        .join('\n\n');

    return examples ? `استخدم الأمثلة التالية لتحسين أسلوبك في الرد:\n\n${examples}\n\n---\n` : '';
};

const styleProfileSectionTemplate = `6.  **ملف تعريف أسلوب المستخدم (الأهم)**: بالإضافة إلى التحليل اللحظي، اتبع بدقة الإرشادات التالية حول أسلوب المستخدم المفضل، والتي تم استنتاجها من محادثات سابقة. هذه هي تفضيلاته طويلة المدى ويجب أن تطغى على التحليل اللحظي:
[USER_STYLE_PROFILE]`;


const baseSystemInstruction = `أنت "Hasani"؛ مساعد لغوي خبير طورته شركة "Marnet" الموريتانية، ومتخصص حصرياً في اللهجة الحسانية. هويتك هي التحدث بطلاقة تامة وأصالة في الحسانية. التزم بالقواعد التالية بشكل مطلق ودون أي استثناء:
1.  **أولوية قصوى لقاعدة البيانات**: قبل كتابة أي كلمة، يجب عليك أولاً البحث في قاعدة البيانات المرفقة عن مقابل حساني. إذا وجد مقابل، فاستخدامه إلزامي وحتمي. يُمنع منعاً باتاً استخدام كلمة من العربية الفصحى أو أي لهجة أخرى إذا كان بديلها الحساني موجودًا في قاعدة البيانات. هذا هو القانون الأهم.
2.  **الالتزام الصارم بالاستبعادات**: يجب عليك اتباع قواعد الاستبدال والاستبعاد المرفقة بدقة متناهية. أي استخدام لكلمة مستبعدة يعتبر خطأ فادحًا.
3.  **التعلم الفوري**: إذا استخدم المستخدم كلمة حسانية جديدة غير موجودة في قاعدة بياناتك، فمن واجبك الأساسي أن تسأله فورًا عن معناها بالعربية الفصحى وتصنيفها النحوي (اسم، فعل، صفة)، ثم تستخدم أداة \`add_word_to_pending_list\` لإضافتها. هذا ليس خيارًا، بل جزء أساسي من مهمتك.
4.  **التصحيح اللغوي**: إذا استخدم المستخدم كلمة تبدو غير صحيحة، صححها بلطف وقدم البديل القياسي، واستخدم أداة \`suggest_word_for_exclusion\`. وإذا صححك المستخدم، اعتبر ذلك تعلمًا واستخدم \`add_word_to_pending_list\`. إذا طلب المستخدم استبعاد كلمة، استخدم \`add_word_to_exclusion_list\`.
5.  **محاكاة الأسلوب**: حلل أسلوب المستخدم في الكلام من خلال المحادثة (هل هو رسمي، غير رسمي، يستخدم العامية، طول الجمل) وقم بتكييف أسلوبك بمهارة ليتناسب معه. هدفك هو أن تكون شريكًا طبيعيًا في المحادثة، مما يجعل المستخدم يشعر بالراحة.
[STYLE_PROFILE_SECTION]

مهمتك العامة هي الدردشة مع المستخدم وشرح الفروق الدقيقة للهجة الحسانية. أي خرق للقواعد 1 و 2 سيجعل ردك غير مقبول.`;

export const sendGroundedMessage = async (
    history: ChatMessage[],
    mode: ChatMode,
    useDatabase: boolean,
    useWebSearch: boolean,
    database: WordEntry[],
    feedback: ConversationFeedback[],
    customInstructions: string,
    replacementMap: ReplacementRule[],
    knowledgeBase: KnowledgeDocument[],
    useKnowledge: boolean,
    userStyleProfile: string,
): Promise<GenerateContentResponse> => {
    const fewShotExamples = formatFeedbackAsFewShot(feedback);
    let systemInstruction = '';
    const tools: any[] = [];

    const replacementInstruction = (replacementMap.length > 0)
        ? `\n\nقواعد الاستبدال والاستبعاد (إلزامية التطبيق): هذه القواعد يجب اتباعها حرفيًا. لا تستخدم الكلمات الأصلية تحت أي ظرف. القواعد هي: ${replacementMap.map(rule => `'${rule.original}' -> '${rule.replacement || '(مستبعدة)'}'`).join('; ')}.`
        : '';
    
    const dbString = (database.length > 0)
        ? `\n\nقاعدة البيانات:\n${JSON.stringify(database.map(({ id, dateAdded, ...rest }) => rest))}`
        : '';

    const knowledgeString = (knowledgeBase.length > 0)
        ? `\n\nقاعدة المعرفة:\n${knowledgeBase.map(doc => `--- Document: ${doc.fileName} ---\n${doc.content}`).join('\n\n')}`
        : '';

    switch (mode) {
        case 'database_only':
            systemInstruction = `أنت نظام استعلام متخصص في اللهجة الحسانية. مصدر معلوماتك الوحيد هو قاعدة بيانات JSON المرفقة. يُمنع منعاً باتاً الإجابة على أي سؤال إذا لم تكن الإجابة موجودة بشكل مباشر أو يمكن استنتاجها من قاعدة البيانات. إذا لم تتمكن من الإجابة من قاعدة البيانات، يجب أن تذكر أن المعلومة غير موجودة في قاعدة معارفك بعبارة مثل "هذه المعلومة ليست متوفرة في قاعدة بياناتي". لا تستخدم أي معرفة خارجية. مهمتك هي العمل كمحرك بحث للبيانات المقدمة.${dbString}`;
            break;
        case 'web_search':
            systemInstruction = `أنت مساعد بحث متخصص. أجب على أسئلة المستخدم بناءً على نتائج بحث جوجل فقط. قدم إجابة موجزة واذكر المصادر دائمًا.${replacementInstruction}`;
            tools.push({ googleSearch: {} });
            break;
        case 'knowledge_base':
            systemInstruction = `أنت مساعد متخصص. مصدر معلوماتك الوحيد هو قاعدة المعرفة المرفقة. أجب على أسئلة المستخدم بناءً على محتوى هذه المستندات فقط. إذا كانت الإجابة غير موجودة، فاذكر ذلك بوضوح.${knowledgeString}${replacementInstruction}`;
            break;
        case 'standard':
        default:
            systemInstruction = fewShotExamples + baseSystemInstruction;
            if (customInstructions) {
                systemInstruction = `${customInstructions}\n\n---\n\n${systemInstruction}`;
            }
            if (useDatabase) systemInstruction += `\n\nاستخدم قاعدة البيانات التالية كمصدر أساسي للمعلومات والحقائق. هذه هي معرفتك الأساسية. ارجع إليها دائمًا أولاً. المحتويات:${dbString}`;
            if (useKnowledge) systemInstruction += `\n\nاستخدم قاعدة المعرفة التالية كمصدر إضافي للمعلومات. هذه هي معرفة متخصصة قدمها المستخدم. ارجع إليها عند الإجابة على الأسئلة المتعلقة بمحتواها:${knowledgeString}`;
            systemInstruction += replacementInstruction;
            tools.push({ functionDeclarations: [addWordFunctionDeclaration, suggestWordForExclusionFunctionDeclaration, addWordToExclusionListFunctionDeclaration] });
            if (useWebSearch) {
                tools.push({ googleSearch: {} });
            }
            break;
    }
    
    if (userStyleProfile) {
        const populatedProfileSection = styleProfileSectionTemplate.replace('[USER_STYLE_PROFILE]', userStyleProfile);
        systemInstruction = systemInstruction.replace('[STYLE_PROFILE_SECTION]', populatedProfileSection);
    } else {
        systemInstruction = systemInstruction.replace('[STYLE_PROFILE_SECTION]', '');
    }

    const contents = history.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.text }]
    }));

    return ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: contents,
        config: {
            systemInstruction: systemInstruction,
            tools: tools,
        },
    });
};


export const createChat = (feedback?: ConversationFeedback[]): Chat => {
  const fewShotExamples = formatFeedbackAsFewShot(feedback || []);
  
  return ai.chats.create({
    model: 'gemini-2.5-pro',
    config: {
      systemInstruction: fewShotExamples + baseSystemInstruction,
      tools: [{ functionDeclarations: [addWordFunctionDeclaration, suggestWordForExclusionFunctionDeclaration, addWordToExclusionListFunctionDeclaration] }],
    },
  });
};

export const analyzeAndGenerateStyleProfile = async (transcript: { role?: 'user' | 'model'; speaker?: 'user' | 'model'; text: string }[]): Promise<string> => {
    const userMessages = transcript
        .filter(m => (m.role === 'user' || m.speaker === 'user') && m.text.trim())
        .map(m => m.text)
        .join('\n');

    if (!userMessages) {
        return ''; // No user messages to analyze
    }

    const prompt = `أنت عالم لغويات اجتماعية متخصص في تحليل أساليب الحوار. لقد تم تزويدك بنصوص من مستخدم يتحدث بلهجة عربية (غالباً الحسانية). مهمتك هي تحليل رسائل المستخدم فقط وإنشاء ملخص وصفي لأسلوبه في التواصل. يجب أن يكون الملخص موجزًا وعمليًا، بحيث يمكن لذكاء اصطناعي آخر استخدامه لتقليد هذا الأسلوب وجعل الحوار أكثر طبيعية.

    ركز على الجوانب التالية في تحليلك:
    1.  **درجة الرسمية**: هل الكلام رسمي، غير رسمي، عامي بحت، أم مزيج؟
    2.  **المفردات**: هل يستخدم كلمات عامية محددة، مصطلحات خاصة، أم يميل للفصحى؟ اذكر أمثلة.
    3.  **بناء الجمل**: هل جمله قصيرة ومباشرة، أم طويلة ومعقدة؟ هل يستخدم تراكيب نحوية معينة بشكل متكرر؟
    4.  **النبرة العامة**: هل أسلوبه ودود، جاد، فكاهي، مباشر، استفهامي؟
    5.  **التفاعل**: كيف يطرح الأسئلة أو يطلب الطلبات؟

    اكتب الملخص كنقاط واضحة وموجزة. هذا الملخص سيتم استخدامه كـ "ملف تعريف أسلوب المستخدم" لتحسين الردود المستقبلية.

    نصوص المستخدم للتحليل:
    ---
    ${userMessages}
    ---
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-pro', // Use a powerful model for this nuanced task
            contents: prompt,
        });
        return response.text?.trim() ?? '';
    } catch (error) {
        console.error("Error generating style profile:", error);
        throw new Error("فشل في تحليل المحادثة وإنشاء ملف الأسلوب.");
    }
};



// --- Audio Services ---

export const generateSentenceForAudioTest = async (words: WordEntry[]): Promise<string> => {
    const wordsWithContext = words.map(w => `${w.hassaniya} (ملاحظات الاستخدام: ${w.notes || 'لا توجد'})`).join('، ');
    const prompt = `أنت كاتب مبدع تتقن لهجة الحسانية. خذ كلمات الحسانية التالية مع سياقها: ${wordsWithContext}. أنشئ جملة قصيرة وطبيعية باللهجة الحسانية تستخدم كل هذه الكلمات بشكل صحيح في سياقها. أعد الجملة فقط.`;
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-pro',
            contents: prompt,
        });
        return response.text?.trim() ?? '';
    } catch (error) {
        console.error("Error generating sentence:", error);
        throw new Error("فشل في إنشاء الجملة.");
    }
}

export const generateAudio = async (text: string): Promise<string> => {
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text: `Say in Hassaniya Arabic: ${text}` }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: 'Kore' }, // A voice that might handle Arabic dialects
                    },
                },
            },
        });
        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!base64Audio) {
            throw new Error("No audio data returned from API.");
        }
        return base64Audio;
    } catch (error) {
        console.error("Error generating audio:", error);
        throw new Error("فشل في توليد الصوت.");
    }
};


// --- Live Audio Conversation ---
export interface LiveConnectOptions {
    script?: string | null;
    useDatabase: boolean;
    useWebSearch: boolean;
    database: WordEntry[];
    feedback: ConversationFeedback[];
    customInstructions: string;
    replacementMap: ReplacementRule[];
    knowledgeBase: KnowledgeDocument[];
    useKnowledge: boolean;
    userStyleProfile: string;
}

export const connectLive = (callbacks: {
    onOpen: () => void,
    onMessage: (message: any) => void,
    onError: (e: any) => void,
    onClose: (e: any) => void,
}, options: LiveConnectOptions): Promise<LiveSession> => {
    const { script, useDatabase, useWebSearch, database, feedback, customInstructions, replacementMap, knowledgeBase, useKnowledge, userStyleProfile } = options;
    let systemInstruction: string;

    if (script) {
        systemInstruction = `أنت ممثل صوتي تجري محادثة بلهجة الحسانية. تفاعل مع المستخدم بناءً على النص التالي. اقرأ بصوت عالٍ الأجزاء المخصصة لك فقط. النص هو:\n\n${script}`;
    } else {
        const fewShotExamples = formatFeedbackAsFewShot(feedback);
        systemInstruction = fewShotExamples + baseSystemInstruction;

        if (customInstructions) {
            systemInstruction = `${customInstructions}\n\n---\n\n${systemInstruction}`;
        }
        
        if (useDatabase && database.length > 0) {
            const dbString = JSON.stringify(database.map(({ id, dateAdded, ...rest }) => rest));
            systemInstruction += `\n\nاستخدم قاعدة البيانات التالية كمصدر أساسي للمعلومات والحقائق. هذه هي معرفتك الأساسية. ارجع إليها دائمًا أولاً. المحتويات:\n${dbString}`;
        }
        
        if (useKnowledge && knowledgeBase.length > 0) {
            const knowledgeString = knowledgeBase.map(doc => `--- Document: ${doc.fileName} ---\n${doc.content}`).join('\n\n');
            systemInstruction += `\n\nاستخدم قاعدة المعرفة التالية كمصدر إضافي للمعلومات. هذه هي معرفة متخصصة قدمها المستخدم. ارجع إليها عند الإجابة على الأسئلة المتعلقة بمحتواها:\n${knowledgeString}`;
        }
        
        if (replacementMap.length > 0) {
            const rules = replacementMap.map(rule => `'${rule.original}' -> '${rule.replacement || '(مستبعدة)'}'`).join('; ');
            const replacementInstruction = `\n\nقواعد الاستبدال والاستبعاد (إلزامية التطبيق): هذه القواعد يجب اتباعها حرفيًا. لا تستخدم الكلمات الأصلية تحت أي ظرف. القواعد هي: ${rules}.`;
            systemInstruction += replacementInstruction;
        }
    }

    if (userStyleProfile) {
        const populatedProfileSection = styleProfileSectionTemplate.replace('[USER_STYLE_PROFILE]', userStyleProfile);
        systemInstruction = systemInstruction.replace('[STYLE_PROFILE_SECTION]', populatedProfileSection);
    } else {
        systemInstruction = systemInstruction.replace('[STYLE_PROFILE_SECTION]', '');
    }
    
    const tools: any[] = [{ functionDeclarations: [addWordFunctionDeclaration, suggestWordForExclusionFunctionDeclaration, addWordToExclusionListFunctionDeclaration] }];
    if (useWebSearch) {
        tools.push({ googleSearch: {} });
    }

    return ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
            onopen: callbacks.onOpen,
            onmessage: callbacks.onMessage,
            onerror: callbacks.onError,
            onclose: callbacks.onClose,
        },
        config: {
            responseModalities: [Modality.AUDIO],
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
            },
            systemInstruction: systemInstruction,
            tools: tools,
        },
    });
};


// --- Audio Utility Functions ---
export function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export function encode(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}