'use strict';

const apiai = require('apiai');
const uuid = require('node-uuid');
const request = require('request');
const FB = require('fb');

const FB_APP_ID = process.env.FB_APP_ID;
const FB_APP_SECRET = process.env.FB_APP_SECRET;
const FB_PAGE_ID = process.env.FB_PAGE_ID;

var fb = new FB.Facebook({version: 'v2.4', Promise: require('bluebird')});

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

                        console.log('response.result.fulfillment: ' + JSON.stringify(response.result.fulfillment));

                        if (TelegramBot.isDefined(responseData) && TelegramBot.isDefined(responseData.telegram)) {

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
        // https://core.telegram.org/bots/api#sendmessage
        request.post(this._telegramApiUrl + '/sendMessage', {
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
        console.log("action: " + action);
        if(action == "show_fb_post") {
            pro = getFBRandomPost();
            pro.then(function (fbres) {
                if(!fbres || fbres.error) {
                    console.log(!res ? 'error occurred' : res.error);
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
            sendFBRandomPhoto(res);
        }
    }
    getFBRandomPost() {
        console.log("random fb post");
        var offset = parseInt(Math.random() * 100) + 1;
        pro = fb.api(FB_PAGE_ID+"/posts?limit=1&offset="+offset);
        return pro;
    }
    sendFBRandomPhoto(res) {
        console.log("random fb photo");
        var offset = parseInt(Math.random() * 2) + 1;
        album = fb.api(FB_PAGE_ID+"/albums?limit=1&offset="+offset);
        album.then(function (res) {
            var d_album = fbres.data[0];
            var offset = parseInt(Math.random() * 20) + 1;
            var photos = fb.api("/" + d_album.id + "/photos?limit=1&offset="+offset);
            photos.then(function(res) {
                var d_photo = fbres.data[0];
                var photo = fb.api("/" + d_photo.id + "/picture");
                photo.then(function(res) {
                    var d_url = fbres.data.url;
                    res.json({
                        "speech": d_url,
                        "displayText":d_url,
                        "data": { "url": d_url },
                        "contextOut": [],
                        "source": "fb"
                    });
                });
            });
        });
    }
}

