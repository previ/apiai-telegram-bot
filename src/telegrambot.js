'use strict';

const apiai = require('apiai');
const uuid = require('node-uuid');
const request = require('request');
const FB = require('fb');

const FB_APP_ID = process.env.FB_APP_ID;
const FB_APP_SECRET = process.env.FB_APP_SECRET;
const FB_PAGE_ID = process.env.FB_PAGE_ID;

let user_jokes =  { "RobertoPrevitera": [" chi sei, il parcheggiatore? Abusivo magari?", " anche tu nato in periferia di New Delhi? Si vede."],
                    "PaoloLiberali": [" è martedì, sai cosa devi fare.", " tu si che hai capito tutto...sei un 'povero ricco', vero? Top!"],
                    "IvanLuzzi": [" sei troppo povero per chattare con me."],
                    "GiuseppeDiMilia": [" sei invitato al Twiga Malindi con gli altri, tranquillo: offre Paolo"],
                    "MircoSadocco": [" ok, allora stasera tutti in terrazza al Twiga di Gallarate!"] };

var fb = new FB.Facebook({version: 'v2.9', Promise: require('bluebird')});

module.exports = class TelegramBot {

    get apiaiService() {
        return this._apiaiService;
    }

    set apiaiService(value) {
        this._apiaiService = value;
    }

    get botConfig() {
        return this._botConfig;
    }

    set botConfig(value) {
        this._botConfig = value;
    }

    get sessionIds() {
        return this._sessionIds;
    }

    set sessionIds(value) {
        this._sessionIds = value;
    }

    constructor(botConfig, baseUrl) {
        this._botConfig = botConfig;
        var apiaiOptions = {
            language: botConfig.apiaiLang,
            requestSource: "telegram"
        };

        this._apiaiService = apiai(botConfig.apiaiAccessToken, apiaiOptions);
        this._sessionIds = new Map();

        this._webhookUrl = baseUrl + '/webhook';
        console.log('Starting bot on ' + this._webhookUrl);

        this._telegramApiUrl = 'https://api.telegram.org/bot' + botConfig.telegramToken;
        
        fb.api('oauth/access_token', {
            client_id: FB_APP_ID,
            client_secret: FB_APP_SECRET,
            grant_type: 'client_credentials'
        }, function (res) {
            if(!res || res.error) {
                console.log(!res ? 'error occurred' : res.error);
                return;
            }

            fb.setAccessToken(res.access_token);
        });
    }

    start(responseCallback, errCallback){
        // https://core.telegram.org/bots/api#setwebhook
        request.post(this._telegramApiUrl + '/setWebhook', {
            json: {
                url: this._webhookUrl
            }
        }, function (error, response, body) {

            if (error) {
                console.error('Error while /setWebhook', error);
                if (errCallback){
                    errCallback(error);
                }
                return;
            }

            if (response.statusCode != 200) {
                console.error('Error status code while /setWebhook', body);
                if (errCallback) {
                    errCallback('Error status code while setWebhook ' + body);
                }
                return;
            }

            console.log('Method /setWebhook completed', body);
            if (responseCallback) {
                responseCallback('Method /setWebhook completed ' + body)
            }
        });
    }

    processMessage(req, res) {
        if (this._botConfig.devConfig) {
            console.log("body", req.body);
        }

        console.log("processMessage: ", req.body);

        let updateObject = req.body;

        if (updateObject && updateObject.message) {
            let msg = updateObject.message;

            var chatId;

            if (msg.chat) {
                chatId = msg.chat.id;
            }

            let messageText = msg.text.replace(/\//g, '');;

            console.log(chatId, messageText);
            
            if (chatId && messageText) {
                if (!this._sessionIds.has(chatId)) {
                    this._sessionIds.set(chatId, uuid.v1());
                }

                let apiaiRequest = this._apiaiService.textRequest(messageText,
                    {
                        sessionId: this._sessionIds.get(chatId)
                    });

                apiaiRequest.on('response', (response) => {
                    if (TelegramBot.isDefined(response.result)) {
                        let responseText = response.result.fulfillment.speech;
                        let responseData = response.result.fulfillment.data;

                        if (TelegramBot.isDefined(responseData) && 
                            TelegramBot.isDefined(responseData.telegram)) {

                            console.log('Response as formatted message');

                            let telegramMessage = responseData.telegram;
                            telegramMessage.chat_id = chatId;

                            this.reply(telegramMessage);
                            TelegramBot.createResponse(res, 200, 'Message processed');

                        } else if (TelegramBot.isDefined(responseText)) {
                            console.log('Response as text message');
                            this.reply({
                                chat_id: chatId,
                                text: responseText
                            });
                            TelegramBot.createResponse(res, 200, 'Message processed');

                        } else {
                            console.log('Received empty speech');
                            TelegramBot.createResponse(res, 200, 'Received empty speech');
                        }
                    } else {
                        console.log('Received empty result');
                        TelegramBot.createResponse(res, 200, 'Received empty result');
                    }
                });

                apiaiRequest.on('error', (error) => {
                    console.error('Error while call to api.ai', error);
                    TelegramBot.createResponse(res, 200, 'Error while call to api.ai');
                });
                apiaiRequest.end();
            }
            else {
                console.log('Empty message');
                return TelegramBot.createResponse(res, 200, 'Empty message');
            }
        } else {
            console.log('Empty message');
            return TelegramBot.createResponse(res, 200, 'Empty message');
        }
    }

    reply(msg) {
        var telegram_method = "sendMessage";
        if(msg.photo) {
            telegram_method = "sendPhoto";
        }
        // https://core.telegram.org/bots/api#sendmessage
        request.post(this._telegramApiUrl + '/' + telegram_method, {
            json: msg
        }, function (error, response, body) {
            if (error) {
                console.error('Error while /sendMessage', error);
                return;
            }

            if (response.statusCode != 200) {
                console.error('Error status code while /sendMessage', body);
                return;
            }

            console.log('Method /sendMessage succeeded');
        });
    }

    static createResponse(resp, code, message) {
        return resp.status(code).json({
            status: {
                code: code,
                message: message
            }
        });
    }

    static isDefined(obj) {
        if (typeof obj == 'undefined') {
            return false;
        }

        if (!obj) {
            return false;
        }

        return obj != null;
    }
    
    processApiAiMessage(req, res) {
        if (this._botConfig.devConfig) {
            console.log("body", req.body);
        }
        let data = req.body;
        let result = data.result;
        let action = result.action;
        console.log("req.body.data: " + JSON.stringify(req.data));
        if(action == "show_fb_post") {
            console.log("random fb post");
            var offset = parseInt(Math.random() * 100) + 1;
            fb.api(FB_PAGE_ID+"/posts?limit=1&offset="+offset, function(fbres){
                if(!fbres || fbres.error) {
                    console.log(!fbres ? 'error occurred' : fbres.error);
                    return;
                }
                let post =  fbres.data[0];
                res.json({
                    "speech": post.message,
                    "displayText": post.message,
                    "data": {},
                    "contextOut": [],
                    "source": "fb"
                });
            });
        } else if(action == "show_fb_photo") {
            var offset = parseInt(Math.random() * 2);
            fb.api(FB_PAGE_ID+"/albums?limit=1&offset="+offset, function(fbres) {                
                var d_album = fbres.data[0];
                console.log("album.id: " + d_album.id);
                fb.api(d_album.id + "/photos?limit=100", function(fbres) {
                    var offset = parseInt(Math.random() * fbres.data.length);
                    var d_photo = fbres.data[offset];
                    console.log("d_photo.id: " + d_photo.id);
                    fb.api(d_photo.id + "/picture?redirect=false", function(fbres) {
                        if(!fbres || fbres.error) {
                            console.log(!fbres ? 'error occurred' : fbres.error);
                            return;
                        }                        
                        console.log("d_url: " + fbres.data.url);
                        var d_url = fbres.data.url;
                        res.json({
                            "speech": "fotina",
                            "displayText": "fotina",
                            "data": { "telegram": {"photo": d_url, "caption": d_photo.name} },
                            "contextOut": [],
                            "source": "fb"
                        });
                    });
                });
            });
        } else if(action == "joke_on_sender") {
          var joke = jokesOnSender({first_name:"Paolo", last_name:"Liberali"})
            res.json({
                "speech": joke,
                "displayText": joke,
                "data": { "telegram": {"text": joke} },
                "contextOut": [],
                "source": "internal"
            });
        }
    }
    jokesOnSender(from) {
        var joke = "";
        var jokes = user_jokes[from.first_name+from.last_name];
        if (jokes) {
            joke = jokes[Math.random(parseInt(Math.random() * jokes.length))];
        }
        return joke;
    }
}

