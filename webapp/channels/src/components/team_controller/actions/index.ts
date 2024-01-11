// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {ServerError} from '@mattermost/types/errors';
import type {GetGroupsForUserParams, GetGroupsParams} from '@mattermost/types/groups';
import type {Team} from '@mattermost/types/teams';

import {fetchChannelsAndMembers} from 'mattermost-redux/actions/channels';
import {logError} from 'mattermost-redux/actions/errors';
import {getGroups, getAllGroupsAssociatedToChannelsInTeam, getAllGroupsAssociatedToTeam, getGroupsByUserIdPaginated} from 'mattermost-redux/actions/groups';
import {forceLogoutIfNecessary} from 'mattermost-redux/actions/helpers';
import {getTeamByName, selectTeam} from 'mattermost-redux/actions/teams';
import {getLicense} from 'mattermost-redux/selectors/entities/general';
import {isCustomGroupsEnabled} from 'mattermost-redux/selectors/entities/preferences';
import {getCurrentUser} from 'mattermost-redux/selectors/entities/users';
import type {ActionFunc} from 'mattermost-redux/types/actions';

import {loadStatusesForChannelAndSidebar} from 'actions/status_actions';
import {addUserToTeam} from 'actions/team_actions';
import LocalStorageStore from 'stores/local_storage_store';

import {getIsChannelBookmarksEnabled} from 'components/channel_bookmarks/utils';

import {isSuccess} from 'types/actions';

export function initializeTeam(team: Team): ActionFunc<Team, ServerError> {
    return async (dispatch, getState) => {
        dispatch(selectTeam(team.id));

        const state = getState();
        const currentUser = getCurrentUser(state);
        LocalStorageStore.setPreviousTeamId(currentUser.id, team.id);

        try {
            await dispatch(fetchChannelsAndMembers(team.id, getIsChannelBookmarksEnabled(state)));
        } catch (error) {
            forceLogoutIfNecessary(error as ServerError, dispatch, getState);
            dispatch(logError(error as ServerError));
            return {error: error as ServerError};
        }

        dispatch(loadStatusesForChannelAndSidebar());

        const license = getLicense(state);
        const customGroupEnabled = isCustomGroupsEnabled(state);
        if (license &&
            license.IsLicensed === 'true' &&
            (license.LDAPGroups === 'true' || customGroupEnabled)) {
            const groupsParams: GetGroupsParams = {
                filter_allow_reference: false,
                page: 0,
                per_page: 60,
                include_member_count: true,
                include_member_ids: true,
                include_archived: false,
            };
            const myGroupsParams: GetGroupsForUserParams = {
                ...groupsParams,
                filter_has_member: currentUser.id,
            };

            if (currentUser) {
                dispatch(getGroupsByUserIdPaginated(myGroupsParams));
            }

            if (license.LDAPGroups === 'true') {
                dispatch(getAllGroupsAssociatedToChannelsInTeam(team.id, true));
            }

            if (team.group_constrained && license.LDAPGroups === 'true') {
                dispatch(getAllGroupsAssociatedToTeam(team.id, true));
            } else {
                dispatch(getGroups(groupsParams));
            }
        }

        return {data: team};
    };
}

export function joinTeam(teamname: string, joinedOnFirstLoad: boolean): ActionFunc<Team, ServerError> {
    return async (dispatch, getState) => {
        const state = getState();
        const currentUser = getCurrentUser(state);

        try {
            const teamByNameResult = await dispatch(getTeamByName(teamname));
            if (isSuccess(teamByNameResult)) {
                const team = teamByNameResult.data;

                if (currentUser && team && team.delete_at === 0) {
                    const addUserToTeamResult = await dispatch(addUserToTeam(team.id, currentUser.id));
                    if (isSuccess(addUserToTeamResult)) {
                        if (joinedOnFirstLoad) {
                            LocalStorageStore.setTeamIdJoinedOnLoad(team.id);
                        }

                        await dispatch(initializeTeam(team));

                        return {data: team};
                    }
                    throw addUserToTeamResult.error;
                }
                throw new Error('Team not found or deleted');
            } else {
                throw teamByNameResult.error;
            }
        } catch (error) {
            forceLogoutIfNecessary(error as ServerError, dispatch, getState);
            dispatch(logError(error as ServerError));
            return {error: error as ServerError};
        }
    };
}
