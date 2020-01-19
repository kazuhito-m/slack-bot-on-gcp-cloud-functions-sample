const request = require('request-promise-native');

async function postMessage(payload) {
    const res = await request.post('https://slack.com/api/chat.postMessage', {
        headers: { 'Authorization': `Bearer ${process.env.BOT_USER_TOKEN}` },
        json: payload,
    });
    if (!res.ok) {
        console.error(res);
    }
    return res;
}

function createSlackAttachment(message) {
    const choices = [
        { text: 'A', value: 'value-A' },
        { text: 'B', value: 'value-B' },
        { text: 'C', value: 'value-C' },
    ];
    return {
        text: message,
        fallback: message,
        attachment_type: 'default',
        callback_id: 'env_selection',
        actions: [{
            name: 'choices',
            text: 'Please select!',
            type: 'select',
            options: choices,
        }],
    }
}

const onRequest = async (req, res) => {
    let payload = req.body;
    console.log(payload);

    if (payload.type === 'url_verification') {
        return res.status(200).json({ 'challenge': payload.challenge });
    }

    if (payload.event && payload.event.type === 'app_mention') {
        if (payload.event.text.includes('hi')) {
            const slackRes = await postMessage({
                text: `<@${payload.event.user}> hi!`,
                channel: payload.event.channel,
                attachments: [createSlackAttachment('BOT response')],
            });
            return res.status(200).json(slackRes);
        }
    }

    if (typeof payload.payload === 'string') {
        payload = JSON.parse(payload.payload)
    }

    if (payload.type === 'interactive_message') {
        const action = payload.actions[0];
        if (action.name === 'choices') {
            const selectedOption = action.selected_options[0];
            return res.status(200).send(`<@${payload.user.id}> Your select value: "${selectedOption.value}"`);
        }
    }

    return res.status(200).send('OK');
};

exports.slackChoicesBot = onRequest;