const request = require('request-promise-native');
const gapis = require('googleapis');


async function postMessage(payload) {
    const res = await request.post('https://slack.com/api/chat.postMessage', {
        headers: { 'Authorization': `Bearer ${process.env.BOT_USER_TOKEN}` },
        json: payload,
    });
    if (!res.ok) console.error('postMessage()にてPostする箇所にてエラー。res:' + JSON.stringify(res));
    return res;
}

function createSlackAttachment(message, versions) {
    console.log('createSlackAttachment()まで来ました:' + message);
    const choices = versions
        .map(v => {
            return { text: v, value:`value:${v}` };
        });
    choices.unshift({ text: '(キャンセル)', value: 'value:__cancel__' });
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

const triggeringCloudBuild = async (projectId, triggerId, targetVersion) => {

    const authCloudBuild = async () => {
      const client = await gapis.google.auth.getClient({
        scopes: ['https://www.googleapis.com/auth/cloud-platform']
      });
      return new gapis.cloudbuild_v1.Cloudbuild({ auth: client });
    }
  
    const authedCloudBuild = await authCloudBuild();
    const runParams = {
        projectId: projectId,
        triggerId: triggerId,
        requestBody: {
            branchName: 'master',
            substitutions: {
                "_PRD_VERSION": targetVersion
            }
        }
    };
    const res = await authedCloudBuild.projects.triggers.run(runParams);


    // return res.data;
    console.info(`triggered build for ${triggerId}`);
    const data = res.data;

    console.info('帰ってきた値のJSON:' + JSON.stringify(data));

    const build = data.metadata.build
    message = `登録されました。status:${build.status}, id:${build.id}`
    console.info(message);

    return message;
}
  
async function listingImageTags(projectId) {
    const url = 'http://metadata.google.internal./computeMetadata/v1/instance/service-accounts/default/token';
    const json = await request.get(url, {
        headers: { 'Metadata-Flavor': `Google` },
    });
    const resStructure = JSON.parse(json);
    console.log('res:access_token' + resStructure.access_token);

    const url2 = `https://asia.gcr.io/v2/${projectId}/webapp/tags/list`;
    const json2 = await request.get(url2, {
        auth: {
            username: `_token`,
            password: resStructure.access_token
        },
    });
    const images = JSON.parse(json2);
    return tagsOf(images);
}

function tagsOf(containerImagesJson) {
    const manifest = containerImagesJson.manifest;
    const tagLists = Object.keys(manifest)
        .map(key => manifest[key])
        .sort((left, right) => {
            return parseInt(right.timeUploadedMs, 10) -  parseInt(left.timeUploadedMs, 10);
        })
        .map(i => i.tag);
    const tags = [];
    for (tagList of tagLists) {
        for (tag of tagList) {
            tags.push(tag);
        }
    }
    // なぜflatMapが無いのか謎
    // .flatMap(i => i.tag.sort((left, right) => right - left))
    return tags;
}

const onRequest = async (req, res) => {
    let payload = req.body;
    console.log('onRequest()まで来ました。');

    if (payload.type === 'url_verification') {
        return res.status(200)
            .json({ 'challenge': payload.challenge });
    }

    if (payload.event && payload.event.type === 'app_mention') {
        const mentsion = payload.event.text;
        if (mentsion.includes('本番') && mentsion.includes('設定')) {
            const versions = await listingImageTags(process.env.GCP_PROJECT_NAME);
            const slackRes = await postMessage({
                text: `やあ! <@${payload.event.user}> さん。`,
                channel: payload.event.channel,
                attachments: [createSlackAttachment('Version(Container Tag)を選択してください。', versions)],
            });
            return res.status(200)
                .json(slackRes);
        }

        if (mentsion.includes('本番') && mentsion.includes('デプロイ')) {
            const o = {
                "text": `<@${payload.user.id}>  環境:production に 現在の設定でデプロイを行います。`,
                "attachments": [
                    {
                        "text": "本番にデプロイしてよろしいですか？",
                        "fallback": "You are unable to choose a game",
                        "callback_id": "do_deploy",
                        "color": "danger",
                        "attachment_type": "default",
                        "actions": [
                            {
                                "name": "deploy",
                                "text": "Yes!",
                                "type": "button",
                                "value": `result:true`
                            },
                            {
                                "name": "deoploy",
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

    if (typeof payload.payload === 'string') {
        payload = JSON.parse(payload.payload)
    }

    if (payload.type === 'interactive_message' && payload.callback_id === 'env_selection') {
        console.log('Yes/Noに来た時のPayload : ' + JSON.stringify(payload) + ' [終わり]');
        const action = payload.actions[0];
        if (action.name === 'choices') {
            const selectedOption = action.selected_options[0];
            const o = {
                "text": `<@${payload.user.id}>  環境:production に Version(Tag):"${selectedOption.value}" でデプロイを行います。`,
                "attachments": [
                    {
                        "text": "本番用設定ファイルを書き換えて良いですか？",
                        "fallback": "You are unable to choose a game",
                        "callback_id": "do_rewirte_version_tag",
                        "color": "danger",
                        "attachment_type": "default",
                        "actions": [
                            {
                                "name": "rewrite_version_tag",
                                "text": "Yes!",
                                "type": "button",
                                "value": `result:true, environment: production, version:${selectedOption.value}`
                            },
                            {
                                "name": "rewrite_version_tag",
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

    if (payload.type === 'interactive_message' && payload.callback_id === 'do_deploy') {
        const action = payload.actions[0];

        if (!action.value.startsWith('result:true')) {
            return res.status(200)
                .send('本番設定の書き換えを取りやめました。');
        }

        const o = {
            "text": `<@${payload.user.id}>  環境:production に 現在の設定でデプロイを行います。`,
            "attachments": [
                {
                    "text": "本当に？",
                    "fallback": "You are unable to choose a game",
                    "callback_id": "confirm_deploy",
                    "color": "danger",
                    "attachment_type": "default",
                    "actions": [
                        {
                            "name": "confirm_deploy_yesno",
                            "text": "Yes!",
                            "type": "button",
                            "value": `result:true`
                        },
                        {
                            "name": "confirm_deploy_yesno",
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

    if (payload && payload.type === 'interactive_message' && payload.callback_id === 'do_rewirte_version_tag') {
        const action = payload.actions[0];
        if (action.name === 'rewrite_version_tag') {
            if (!action.value.startsWith('result:true')) {
                return res.status(200)
                    .send('本番設定の書き換えを取りやめました。');
            }

            const targetVersion =  action.value.replace(/.*version:value:/, '');
            await triggeringCloudBuild(process.env.GCP_PROJECT_NAME, process.env.GCP_CLOUDBUILD_TRIGGER_ID, targetVersion);

            const caption =  action.value.replace(/.*true, /, '');
            const description = `${caption} で、本番設定の書き換えを受け付けました。\n結果は各種環境のチャンネルでご確認ください。\n <#CPYBX1JLD>`;
            return res.status(200)
                .send(description);
        }
    }

    if (payload && payload.type === 'interactive_message' && payload.callback_id === 'confirm_deploy') {
        const action = payload.actions[0];
        if (action.name === 'confirm_deploy_yesno') {
            if (!action.value.startsWith('result:true')) {
                return res.status(200)
                    .send('本番のデプロイを取りやめました。');
            }

            const targetVersion = 'これが来たなら、デプロイしたってことで♪';
            await triggeringCloudBuild(process.env.GCP_PROJECT_NAME, process.env.GCP_CLOUDBUILD_TRIGGER_ID, targetVersion);

            const caption =  action.value.replace(/.*true, /, '');
            const description = `本番のデプロイを受け付けました。\n結果は各種環境のチャンネルでご確認ください。\n <#CPYBX1JLD>`;
            return res.status(200)
                .send(description);
        }
    }

    return res.status(200).send('はい、なんでしょうか？');
};

exports.slackChoicesBot = onRequest;