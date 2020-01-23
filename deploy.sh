#!/bin/bash

REGION=asia-northeast1

# kickしたディレクトリから、このスクリプトのあるディレクトリに移動。
cd $(cd $(dirname $0);pwd)

gcloud beta functions deploy slackChoicesBot \
    --runtime nodejs8 \
    --trigger-http \
    --region ${REGION}
    --env-vars-file .env.yml
