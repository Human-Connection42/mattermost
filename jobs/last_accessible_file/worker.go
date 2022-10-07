// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package last_accessible_file

import (
	"github.com/mattermost/mattermost-server/v6/app/request"
	"github.com/mattermost/mattermost-server/v6/jobs"
	"github.com/mattermost/mattermost-server/v6/model"
	"github.com/mattermost/mattermost-server/v6/shared/mlog"
)

const (
	JobName = "LastAccessibleFile"
)

type AppIface interface {
	ComputeLastAccessibleFileTime(request.CTX) error
	Log() *mlog.Logger
}

func MakeWorker(jobServer *jobs.JobServer, license *model.License, app AppIface) model.Worker {
	isEnabled := func(_ *model.Config) bool {
		return license != nil && *license.Features.Cloud
	}
	execute := func(_ *model.Job) error {
		return app.ComputeLastAccessibleFileTime(request.EmptyContext(app.Log()))
	}
	worker := jobs.NewSimpleWorker(JobName, jobServer, execute, isEnabled)
	return worker
}
