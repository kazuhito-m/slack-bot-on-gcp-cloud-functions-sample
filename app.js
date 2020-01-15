const onRequest = (req, res) => {
    const payload = req.body;

    if (payload.type === 'url_verification') {
        return res.status(200).json({ 'challenge': payload.challenge });
    }

    res.status(200).send('OK');
}

exports.slackChoicesBot = onRequest;