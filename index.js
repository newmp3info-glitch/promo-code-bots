const TelegramBot = require('node-telegram-bot-api');
const http = require('http');
const fs = require('fs');
const cron = require('node-cron');

const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

// Target channel username
const TARGET_CHANNEL = '@VipYonoFreeCode';

const POSTS_FILE = 'posts.json';
const USERS_FILE = 'users.json';

// ==========================================
// Database Safety & Persistence Logic
// ==========================================
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

// ==========================================
// Single-Message Screen Manager
// ==========================================
let lastBotMessage = {}; 

async function sendSingleMessage(chatId, text, photo, replyMarkup) {
    const options = { 
        parse_mode: "HTML",
        disable_web_page_preview: true 
    };
    if (replyMarkup) options.reply_markup = replyMarkup;

    let sentMsg = null;

    try {
        if (photo) {
            sentMsg = await bot.sendPhoto(chatId, photo, { caption: text, ...options });
        } else if (text) {
            sentMsg = await bot.sendMessage(chatId, text, options);
        }

        if (lastBotMessage[chatId]) {
            try {
                await bot.deleteMessage(chatId, lastBotMessage[chatId]);
            } catch (e) {}
        }

        if (sentMsg) {
            lastBotMessage[chatId] = sentMsg.message_id;
        }
    } catch (err) {
        console.error(`Error sending message to ${chatId}:`, err.message);
    }
}

// Web Server Setup
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is running successfully!\n');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});

// Smart formatting function
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

        if (nonEmtpyCount === 1) {
            let cleanLine = trimmed.replace(/<[^>]*>/g, '');
            formattedLines.push(`<b>${cleanLine}</b>`);
            return;
        }

        if (lower.includes('code') && !lower.startsWith('http') && !lower.includes('app link') && !lower.includes('join this channel') && !lower.includes('never miss')) {
            let parts = trimmed.split(/➔|->|➜|:/);
            if (parts.length > 1) {
                let label = parts[0].trim();
                let rawCode = parts.slice(1).join(':').replace(/<[^>]*>/g, '').replace(/`/g, '').trim();
                let safeCode = rawCode.replace(/\./g, '.\u200B');
                formattedLines.push(`<b>${label}</b> ➜ <code>${safeCode}</code>`);
            } else {
                let safeTrimmed = trimmed.replace(/\./g, '.\u200B');
                formattedLines.push(`➜ <code>${safeTrimmed}</code>`);
            }
        } 
        else if (lower.includes('download now') || lower.includes('game link') || lower.includes('link')) {
            if (downloadUrl) {
                if (lower.includes('download now')) {
                    let replacedLine = trimmed.replace(/download now/gi, `<a href="${downloadUrl}"><b>Download Now</b></a>`);
                    formattedLines.push(replacedLine);
                } else {
                    formattedLines.push(`<b>🎰 GAME LINK </b> ➜ <a href="${downloadUrl}"><b>Download Now</b></a>📱`);
                }
            } else {
                formattedLines.push(trimmed);
            }
        } 
        else if (lower.includes('minimum') || lower.includes('withdrawal')) {
            let cleanLine = trimmed.replace(/<[^>]*>/g, '');
            formattedLines.push(`<b>${cleanLine}</b>`);
        } 
        else if (
            lower.includes('signup bonus') || 
            lower.includes('new users') || 
            lower.includes('join this channel') || 
            lower.includes('pin this channel') ||
            lower.includes('never miss') ||
            lower.includes('important promo code') ||
            trimmed.startsWith('🔥') ||
            trimmed.startsWith('🎁')
        ) {
            let cleanLine = trimmed.replace(/<[^>]*>/g, '');
            formattedLines.push(`<blockquote>${cleanLine}</blockquote>`);
        } 
        else {
            formattedLines.push(trimmed);
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

function savePostContent(msg) {
    let rawText = msg.caption || msg.text || '';
    let entities = msg.caption_entities || msg.entities || [];
    
    let text = smartFormatPost(rawText, entities);
    if (!text) text = rawText;
    
    const photo = msg.photo ? msg.photo[msg.photo.length - 1].file_id : null;
    const replyMarkup = msg.reply_markup || null;
    
    let postContent = null;

    if (text || photo) {
        postContent = {
            text: text,
            photo: photo,
            replyMarkup: replyMarkup || null,
            timestamp: Date.now()
        };

        if (!postDatabase.all_posts) {
            postDatabase.all_posts = [];
        }
        const globalExists = postDatabase.all_posts.some(p => p.text === text);
        if (!globalExists) {
            postDatabase.all_posts.push(postContent);
            savePosts();
            return true;
        }
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

// ==========================================
// Message Handler & Secure Forward Logic
// ==========================================
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!botUsers.includes(chatId)) {
        botUsers.push(chatId);
        saveUsers();
    }

    // Security check: Only save forwarded messages from TARGET_CHANNEL
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

    // Normal message / Search handling
    if (text) {
        try { await bot.deleteMessage(chatId, msg.message_id); } catch (e) {}

        if (text.startsWith('/start')) {
            const welcomeText = `<b>Welcome to the Official Promo Code Bot!</b>\n\n<b>⚠️ Notice:</b> Here you will get Only Yono Promo Code. No other games or unrelated content will be provided here.\n\n🚀 All updates and promo codes for any new Yono games will be available here first!\n\n📢 <b>How to get codes instantly:</b>\n• Whenever you join, you will automatically receive new posts.\n• Need codes right now? Just type and search the game name in the chat. The bot will instantly send you the available promo codes right away!`;
            
            // লোকাল ফোল্ডার থেকে অডিও ফাইলটি পাঠাবে (কোনো file_id লাগবে না)
            try {
                if (fs.existsSync('./audio.mp3')) {
                    await bot.sendAudio(chatId, fs.createReadStream('./audio.mp3'), {
                        caption: "🎵 Yono All Promo Code ▶️"
                    });
                }
            } catch (e) {
                console.error("Error sending audio:", e.message);
            }

            // মূল ওয়েলকাম টেক্সট পাঠাবে
            await sendSingleMessage(chatId, welcomeText, null, null);

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

console.log("Bot running with strict target-channel security filter and pure English system messages!");
