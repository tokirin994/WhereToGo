package com.travelatlas.library;

import java.util.*;
import javax.validation.Valid;
import javax.validation.constraints.*;

/** Coordinates are deliberately excluded: extracted names are not verified locations. */
public class RouteInput {
    @NotBlank @Size(max=180) public String name;
    @NotBlank @Size(max=120) public String city;
    @NotNull @Pattern(regexp="hiking|cycling|citywalk|drive") public String mode="hiking";
    @NotNull @Pattern(regexp="point-to-point|loop|out-and-back|unknown") public String shape="unknown";
    @NotNull @Pattern(regexp="unknown|easy|moderate|hard") public String difficulty="unknown";
    @DecimalMin("0.01") @DecimalMax("10000") public Double distanceKm;
    @Min(1) @Max(43200) public Integer durationMinutes;
    @Min(0) @Max(20000) public Integer ascentM;
    @NotNull @Size(max=5000) public String description="";
    @NotNull @Size(max=3000) public String tips="";
    @NotNull @Size(max=1500) public String sourceUrl="";
    @NotNull @Size(max=200) public String sourceLabel="手动收藏";
    @NotNull @Size(max=800) public String evidence="";
    @NotNull @Size(max=12) public List<@NotBlank @Size(max=40) String> tags=new ArrayList<>();
    @NotNull @Valid @Size(min=2,max=80) public List<@NotNull @Valid Waypoint> waypoints=new ArrayList<>();
    public boolean favorite=false;
    public boolean completed=false;
    @AssertTrue(message="来源链接必须是无内嵌账号密码的 HTTPS 地址")
    public boolean isSourceValid(){if(sourceUrl==null||sourceUrl.isEmpty())return true;try{java.net.URI uri=java.net.URI.create(sourceUrl);return "https".equals(uri.getScheme())&&uri.getHost()!=null&&uri.getUserInfo()==null;}catch(Exception e){return false;}}
    public static class Waypoint {
        @NotBlank @Size(max=180) public String name;
        @NotNull @Size(max=300) public String note="";
    }
}
