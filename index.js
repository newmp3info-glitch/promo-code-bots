const TelegramBot = require('node-telegram-bot-api');
const http = require('http');
const fs = require('fs');
const cron = require('node-cron');

const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

const TARGET_CHANNEL = '@VipYonoFreeCode';

const POSTS_FILE = 'posts.json';
const USERS_FILE = 'users.json';
const VOICE_ID_FILE = 'voice_id.txt';

if (!fs.existsSync(POSTS_FILE)) {
    fs.writeFileSync(POSTS_FILE, JSON.stringify({ all_posts: [] }, null, 2));
}

let postDatabase = { all_posts: [] };
try {
    postDatabase = JSON.parse(fs.readFileSync(POSTS_FILE, 'utf8'));
    if (!postDatabase.all_posts) postDatabase.all_posts = [];
} catch (e) {
    postDatabase = { all_posts: [] };
}

function savePosts() {
    fs.writeFileSync(POSTS_FILE, JSON.stringify(postDatabase, null, 2));
}

if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify([], null, 2));
}

let botUsers = [];
try {
    botUsers = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
} catch (e) {
    botUsers = [];
}

function saveUsers() {
    fs.writeFileSync(USERS_FILE, JSON.stringify(botUsers, null, 2));
}

let userMessages = {}; 

async function sendSingleMessage(chatId, text, photo, replyMarkup) {
    const options = { 
        parse_mode: "HTML",
        disable_web_page_preview: true 
    };
    if (replyMarkup) options.reply_markup = replyMarkup;

    let sentMsg = null;

    try {
        if (photo) {
            if (text && text.length > 1024) {
                await bot.sendPhoto(chatId, photo, { reply_markup: replyMarkup });
                sentMsg = await bot.sendMessage(chatId, text, options);
            } else {
                sentMsg = await bot.sendPhoto(chatId, photo, { caption: text, ...options });
            }
        } else if (text) {
            sentMsg = await bot.sendMessage(chatId, text, options);
        }

        if (sentMsg) {
            if (userMessages[chatId] && userMessages[chatId].length > 0) {
                for (let oldMsgId of userMessages[chatId]) {
                    if (oldMsgId !== sentMsg.message_id) {
                        try {
                            await bot.deleteMessage(chatId, oldMsgId);
                        } catch (e) {}
                    }
                }
            }
            userMessages[chatId] = [sentMsg.message_id];
        }
    } catch (err) {
        console.error(`Error sending message to ${chatId}:`, err.message);
    }
}

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is running successfully!\n');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});

function smartFormatPost(text, entities) {
    if (!text) return '';

    if (text.includes('All Yono Apps') && !text.toLowerCase().includes('code')) {
        return text; 
    }

    let downloadUrl = '';
    if (entities && entities.length > 0) {
        entities.forEach(entity => {
            if (entity.type === 'text_link' && entity.url) {
                if (!entity.url.includes('t.me') && !entity.url.includes('telegram')) {
                    downloadUrl = entity.url;
                }
            } else if (entity.type === 'url') {
                let extractedUrl = text.substring(entity.offset, entity.offset + entity.length);
                if (extractedUrl && !extractedUrl.includes('t.me') && !extractedUrl.includes('telegram')) {
                    downloadUrl = extractedUrl;
                }
            }
        });
    }

    if (!downloadUrl) {
        let urlMatch = text.match(/(https?:\/\/[^\s<]+)/g);
        if (urlMatch) {
            for (let u of urlMatch) {
                if (!u.includes('t.me') && !u.includes('telegram')) {
                    downloadUrl = u;
                    break;
                }
            }
        }
    }

    let lines = text.split('\n');
    let formattedLines = [];
    let hashtags = [];
    let nonEmtpyCount = 0;

    lines.forEach(line => {
        let trimmed = line.trim();
        if (!trimmed) return;
        let lower = trimmed.toLowerCase();

        if (trimmed.startsWith('#')) {
            let tags = trimmed.match(/#\w+/g);
            if (tags) {
                tags.forEach(t => {
                    if (!hashtags.includes(t)) hashtags.push(t);
                });
            }
            return;
        }

        nonEmtpyCount++;

        // ১ম লাইন: গেমের নাম ও টাইটেল
        if (nonEmtpyCount === 1) {
            let cleanLine = trimmed.replace(/<[^>]*>/g, '');
            formattedLines.push(`<b>${cleanLine}</b>`);
            return;
        }

        // প্রমো কোড লাইন শনাক্তকরণ (এটি চ্যানেলের মতো সাধারণ বা বোল্ড থাকবে, কোনো ব্লককোট বা ভুল লিংক থাকবে না)
        let isPromoCodeLine = (lower.includes('promo code') || lower.includes('.com') || lower.includes('.win') || lower.includes('.net'));

        // ডাউনলোড লাইন শনাক্তকরণ
        let isDownloadLine = (lower.includes('download now') || lower.includes('game link') || (lower.includes('link') && !lower.includes('promo')));

        // যে লাইনগুলোতে ব্লককোট বা কোট স্টাইল থাকবে (বোনাস এবং জয়েন লাইন)
        let isQuoteLine = (
            lower.includes('signup bonus') || 
            lower.includes('new users') || 
            lower.includes('join') || 
            lower.includes('pin') || 
            lower.includes('never miss') ||
            lower.includes('important') ||
            trimmed.startsWith('🔥') ||
            trimmed.startsWith('🎁')
        );

        if (isPromoCodeLine) {
            let cleanLine = trimmed.replace(/<[^>]*>/g, '');
            formattedLines.push(cleanLine);
        }
        else if (isQuoteLine && !isDownloadLine) {
            let cleanLine = trimmed.replace(/<[^>]*>/g, '');
            formattedLines.push(`<blockquote><b>${cleanLine}</b></blockquote>`);
        } 
        else if (isDownloadLine) {
            if (downloadUrl) {
                // ডুপ্লিকেট রোধ করে নিখুঁতভাবে শুধুমাত্র 'Download Now'-কে লিংকে রূপান্তর
                let prefixPart = trimmed.split(/download now/i)[0].replace(/<[^>]*>/g, '').trim();
                if (prefixPart) {
                    formattedLines.push(`${prefixPart} <a href="${downloadUrl}"><b>Download Now</b></a>📱`);
                } else {
                    formattedLines.push(`🎰 <b>GAME LINK</b> ➜ <a href="${downloadUrl}"><b>Download Now</b></a>📱`);
                }
            } else {
                formattedLines.push(trimmed);
            }
        } 
        else {
            let cleanLine = trimmed.replace(/<[^>]*>/g, '');
            formattedLines.push(cleanLine);
        }
    });

    if (hashtags.length > 0) {
        formattedLines.push(`<blockquote><tg-spoiler>${hashtags.join(' ')}</tg-spoiler></blockquote>`);
    }

    return formattedLines.join('\n\n');
}

function broadcastPostToAllUsers(post) {
    if (!botUsers || botUsers.length === 0) return;

    botUsers.forEach((userId, index) => {
        setTimeout(() => {
            sendSingleMessage(userId, post.text, post.photo, post.replyMarkup);
        }, index * 50); 
    });
}

function getGameIdentifier(text) {
    if (!text) return '';
    let firstLine = text.split('\n')[0].toLowerCase();
    let cleanGame = firstLine.replace(/->|➔|➜/g, ' ').split('new promo')[0].split('promo')[0].trim();
    return cleanGame.replace(/[^a-z0-9]/g, '');
}

function savePostContent(msg) {
    let rawText = msg.caption || msg.text || '';
    let entities = msg.caption_entities || msg.entities || [];
    
    let formattedText = smartFormatPost(rawText, entities);
    if (!formattedText) formattedText = rawText;
    
    const photo = msg.photo ? msg.photo[msg.photo.length - 1].file_id : null;
    const replyMarkup = msg.reply_markup || null;
    
    if (formattedText || photo) {
        const textExists = postDatabase.all_posts.some(p => p.rawText === rawText);
        if (textExists) {
            return false;
        }

        const gameKey = getGameIdentifier(rawText);
        if (gameKey && gameKey.length > 2) {
            postDatabase.all_posts = postDatabase.all_posts.filter(p => {
                return getGameIdentifier(p.rawText) !== gameKey;
            });
        }

        let postContent = {
            rawText: rawText,
            text: formattedText,
            photo: photo,
            replyMarkup: replyMarkup || null,
            timestamp: Date.now()
        };

        if (!postDatabase.all_posts) {
            postDatabase.all_posts = [];
        }
        
        postDatabase.all_posts.push(postContent);
        savePosts();
        return true;
    }

    return false;
}

bot.on('channel_post', (msg) => {
    const chatUsername = msg.chat.username ? `@${msg.chat.username.toLowerCase()}` : '';
    if (chatUsername === TARGET_CHANNEL.toLowerCase()) {
        const saved = savePostContent(msg);
        if (saved) {
            let rawText = msg.caption || msg.text || '';
            let entities = msg.caption_entities || msg.entities || [];
            let text = smartFormatPost(rawText, entities);
            broadcastPostToAllUsers({
                text: text,
                photo: msg.photo ? msg.photo[msg.photo.length - 1].file_id : null,
                replyMarkup: msg.reply_markup || null
            });
        }
    }
});

function getLatestPostForQuery(userQuery) {
    if (!postDatabase.all_posts || postDatabase.all_posts.length === 0) {
        return null;
    }

    const cleanQuery = userQuery.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (cleanQuery.length < 2) return null;

    let matched = postDatabase.all_posts.filter(post => {
        if (!post.text) return false;
        let cleanText = post.text.toLowerCase().replace(/[^a-z0-9]/g, '');
        return cleanText.includes(cleanQuery);
    });

    if (matched.length === 0) return null;

    matched.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    return matched[0];
}

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!botUsers.includes(chatId)) {
        botUsers.push(chatId);
        saveUsers();
    }

    if (msg.forward_from_chat) {
        const forwardedChannelUsername = msg.forward_from_chat.username ? `@${msg.forward_from_chat.username.toLowerCase()}` : '';

        if (forwardedChannelUsername === TARGET_CHANNEL.toLowerCase()) {
            let isSaved = savePostContent(msg);
            if (isSaved) {
                await bot.sendMessage(chatId, `✅ <b>Post successfully saved to database!</b>\n📊 Total saved posts: <b>${postDatabase.all_posts.length}</b>`, { parse_mode: "HTML" });
            } else {
                await bot.sendMessage(chatId, `⚠️ <b>This post already exists in the database or is empty!</b>`, { parse_mode: "HTML" });
            }
            return;
        }
    }

    if (text) {
        if (text.startsWith('/start')) {
            const welcomeText = `<b>Welcome to the Official Promo Code Bot!</b>\n\n<b>⚠️ Notice:</b> Here you will get Only Yono Promo Code. No other games or unrelated content will be provided here.\n\n🚀 All updates and promo codes for any new Yono games will be available here first!\n\n📢 <b>How to get codes instantly:</b>\n• Whenever you join, you will automatically receive new posts.\n• Need codes right now? Just type and search the game name in the chat. The bot will instantly send you the available promo codes right away!`;
            
            try {
                let newMsgIds = [];

                let textMsg = await bot.sendMessage(chatId, welcomeText, { parse_mode: "HTML", disable_web_page_preview: true });
                if (textMsg) newMsgIds.push(textMsg.message_id);

                let cachedVoiceId = '';
                if (fs.existsSync(VOICE_ID_FILE)) {
                    cachedVoiceId = fs.readFileSync(VOICE_ID_FILE, 'utf8').trim();
                }

                let voiceMsg = null;
                if (cachedVoiceId) {
                    voiceMsg = await bot.sendVoice(chatId, cachedVoiceId);
                } else if (fs.existsSync('./audio.mp3')) {
                    voiceMsg = await bot.sendVoice(chatId, fs.createReadStream('./audio.mp3'));
                    if (voiceMsg && voiceMsg.voice && voiceMsg.voice.file_id) {
                        fs.writeFileSync(VOICE_ID_FILE, voiceMsg.voice.file_id);
                    }
                }

                if (voiceMsg) newMsgIds.push(voiceMsg.message_id);

                try { await bot.deleteMessage(chatId, msg.message_id); } catch (e) {}

                if (userMessages[chatId] && userMessages[chatId].length > 0) {
                    for (let oldMsgId of userMessages[chatId]) {
                        try { await bot.deleteMessage(chatId, oldMsgId); } catch (e) {}
                    }
                }
                userMessages[chatId] = newMsgIds;

            } catch (e) {
                console.error("Error sending welcome message & voice:", e.message);
            }

        } else {
            let foundPost = getLatestPostForQuery(text);

            if (foundPost) {
                await sendSingleMessage(chatId, foundPost.text, foundPost.photo, foundPost.replyMarkup);
            } else {
                const notFoundMessage = `🔥 <b>EXCLUSIVE CODE IS GENERATING...</b> 🔥\n\n` +
                    `⚡ The VIP promo code for <b>"${text.trim()}"</b> is currently being refreshed and will drop very soon!\n\n` +
                    `💡 <b>DON'T JUST WAIT! DO THIS RIGHT NOW:</b>\n` +
                    `• 🎮 Don't wait for just this one game! Search for <b>ANY OTHER YONO GAME</b> in the chat right now!\n` +
                    `• 💰 Hundreds of live promo codes for other Yono games are active & ready to claim!\n` +
                    `• 🔔 Keep notifications <b>ON</b> so you don't miss the fast drop.\n` +
                    `• ⏳ Search for <b>"${text.trim()}"</b> again in <b>2 to 5 minutes</b> to grab it first!\n\n` +
                    `👑 <i>This is your #1 Official Hub for <b>ALL YONO GAMES & ALL VIP CODES!</b> 🚀</i>`;

                await sendSingleMessage(chatId, notFoundMessage, null, null);
            }

            setTimeout(async () => {
                try {
                    await bot.deleteMessage(chatId, msg.message_id);
                } catch (e) {}
            }, 1500);
        }
    }
});

const weeklyMessage = `⚡ <b>WEEKLY VIP BONUS ALERT!</b> ⚡\n\n` +
    `🎁 <b>New Yono Promo Codes Are Now Live!</b>\n\n` +
    `Hey Gamer! Hundreds of fresh & active promo codes for <b>ALL YONO GAMES</b> have just been updated! Don't let your free bonuses expire! 💰\n\n` +
    `🔥 <b>WHAT TO DO RIGHT NOW:</b>\n` +
    `• 🎮 Type & search <b>ANY Yono Game Name</b> in this chat right now!\n` +
    `• 💎 Claim your daily signup & deposit promo codes instantly!\n` +
    `• 🔔 Keep your notifications <b>ON</b> so you never miss a fast-claim code drop!\n\n` +
    `👑 <i>Type your favorite game name below and grab your free code now! 🚀</i>`;

cron.schedule('0 10 * * 0', () => {
    if (botUsers && botUsers.length > 0) {
        botUsers.forEach((userId, index) => {
            setTimeout(() => {
                sendSingleMessage(userId, weeklyMessage, null, null);
            }, index * 50); 
        });
    }
});

console.log("Bot running with perfect channel-matching formatting!");
