const request = require('request-promise-native');

async function postMessage(payload) {
    const res = await request.post('https://slack.com/api/chat.postMessage', {
        headers: { 'Authorization': `Bearer ${process.env.BOT_USER_TOKEN}` },
        json: payload,
    });
    if (!res.ok) console.error('postMessage()にてPostする箇所にてエラー。res:' + JSON.stringify(res));
    return res;
}

function createSlackAttachment(message) {
    console.log('createSlackAttachment()まで来ました:' + message);
    const choices = [
        { text: '(キャンセル)', value: 'value:__cancel__' },
        { text: '0.0.19', value: 'value:0.0.19' },
        { text: '0.0.18', value: 'value:0.0.18' },
    ];
    return {
        text: message,
        fallback: message,
        attachment_type: 'default',
        callback_id: 'env_selection',
        actions: [{
            name: 'choices',
            text: 'Version(Container Tag)を選択してください。',
            type: 'select',
            options: choices,
        }],
    }
}

const onRequest = async (req, res) => {
    let payload = req.body;
    console.log('onRequest()まで来ました。PayLoad:' + payload);

    if (payload.type === 'url_verification') {
        return res.status(200)
            .json({ 'challenge': payload.challenge });
    }

    if (payload.event && payload.event.type === 'app_mention') {
        if (payload.event.text.includes('hi')) {
            const slackRes = await postMessage({
                text: `やあ! <@${payload.event.user}> さん。`,
                channel: payload.event.channel,
                attachments: [createSlackAttachment('Version(Container Tag)を選択してください。')],
            });
            return res.status(200)
                .json(slackRes);
        }
    }

    if (typeof payload.payload === 'string') {
        payload = JSON.parse(payload.payload)
    }

    if (payload.type === 'interactive_message') {
        const action = payload.actions[0];
        if (action.name === 'choices') {
            const selectedOption = action.selected_options[0];
            const o = {
                "text": `<@${payload.user.id}>  環境:production に Version(Tag):"${selectedOption.value}" でデプロイを行います。`,
                "attachments": [
                    {
                        "text": "デプロイして良いですか？",
                        "fallback": "You are unable to choose a game",
                        "callback_id": "do_deploy",
                        "color": "danger",
                        "attachment_type": "default",
                        "actions": [
                            {
                                "name": "deploy",
                                "text": "Yes!",
                                "type": "button",
                                "value": `result:true, environment: production, version:${selectedOption.value}`
                            },
                            {
                                "name": "deploy",
                                "text": "No.",
                                "type": "button",
                                "value": "result:false"
                            }
                        ]
                    }
                ]
            }
            return res.status(200)
                .json(o);
        }
    }

    if (payload && payload.type === 'interactive_message') {
        const action = payload.actions[0];
        if (action.name === 'deploy') {
            if (!action.value.startsWith('result:true')) {
                return res.status(200)
                    .send('デプロイを取りやめました。');
            }
            const caption =  action.value.replace(/.*true, /, '');
            const description = `${caption} で、デプロイ依頼を受け付けました。\n結果は各種環境のチャンネルでご確認ください。\n <#CPYBX1JLD>`;
            return res.status(200)
                .send(description);
        }
    }

    return res.status(200).send('はい、なんでしょうか？');
};

exports.slackChoicesBot = onRequest;