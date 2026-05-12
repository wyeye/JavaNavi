package com.javanavi.api;

import com.javanavi.model.ApiEnvelope;
import com.javanavi.model.MongoContracts;
import com.javanavi.mongodb.MongoCompatibilityService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/mongodb")
public class MongoCompatibilityController {
    private final MongoCompatibilityService mongoCompatibilityService;

    public MongoCompatibilityController(MongoCompatibilityService mongoCompatibilityService) {
        this.mongoCompatibilityService = mongoCompatibilityService;
    }

    @PostMapping("/discover-members")
    public ApiEnvelope<MongoContracts.DiscoverMembersResponse> discoverMembers(@RequestBody(required = false) MongoContracts.DiscoverMembersRequest input) {
        return ApiEnvelope.ok(mongoCompatibilityService.discoverMembers(input == null ? new MongoContracts.DiscoverMembersRequest(null) : input));
    }
}
